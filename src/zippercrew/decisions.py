"""Concise decision copy from actual participant output, never invented findings."""

from __future__ import annotations

import json
import re
from typing import Any

SUMMARY_TAG = re.compile(r"<decision-summary>\s*(.*?)\s*</decision-summary>", re.S)


def review_metadata(report: str) -> dict[str, Any]:
    match = SUMMARY_TAG.search(report)
    if match:
        try:
            value = json.loads(match[1])
            if isinstance(value, dict):
                return value
        except (ValueError, TypeError):
            pass
    return {}


def plain_summary(text: str, limit: int = 280) -> str:
    text = re.sub(r"\[([^]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"[*_`#]", "", text)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit].rsplit(" ", 1)[0] + "…"


def first_sentence(report: str) -> str:
    prose = re.sub(r"```.*?(?:```|\Z)", "", report, flags=re.S)
    for line in prose.splitlines():
        line = line.strip()
        if not line or line.startswith(("#", "$", "Full text:", "zg ", "<")):
            continue
        if line.strip("* :").casefold() in {"summary", "result", "implementation", "changes"}:
            continue
        return plain_summary(line)
    return ""


def decision_summary(proposal: str, critique: str, header: str | None) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "recommendation": None,
        "reason": first_sentence(proposal),
        "worker": first_sentence(proposal),
        "task_issue": False,
        "findings": None,
    }
    if header is None:
        return summary
    verdict, findings, headline = header.split("|", 2)
    lines = critique.strip().splitlines()
    valid = len(lines) >= 3 and lines[0].strip().upper() in {"APPROVE", "REVISE"}
    summary.update(
        recommendation=("Ship it" if verdict == "APPROVE" else "Another round") if valid else None,
        reason=plain_summary(headline),
        findings=int(findings) if findings.isdigit() else None,
    )
    # New reviews may explicitly identify a task-specification problem. Never
    # guess this from a keyword or silently infer that the Worker made no edits.
    data = review_metadata(critique)
    for key in ("reason", "worker"):
        if isinstance(data.get(key), str) and data[key].strip():
            summary[key] = plain_summary(data[key])
    summary["task_issue"] = valid and data.get("task_needs_clarification") is True
    return summary


def review_fields(report: str) -> dict[str, Any]:
    """An invalid review can never count as an approval."""
    lines = report.strip().splitlines()
    metadata = review_metadata(report)
    header_verdict = lines[0].strip().upper() if lines else None
    if header_verdict not in {"APPROVE", "REVISE"}:
        header_verdict = None
    explicit_verdict = metadata.get("verdict")
    if not isinstance(explicit_verdict, str) or explicit_verdict not in {"APPROVE", "REVISE"}:
        explicit_verdict = None
    conflict = bool(header_verdict and explicit_verdict and header_verdict != explicit_verdict)
    count = None
    if len(lines) >= 2 and re.fullmatch(r"FINDINGS:\s*\d+", lines[1].strip(), re.I):
        count = int(lines[1].split(":", 1)[1])
    valid = not conflict and count is not None and bool(header_verdict or explicit_verdict)
    reason = metadata.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        reason = (
            lines[2]
            if len(lines) >= 3 and lines[2].strip()
            else (
                "The reviewer did not provide a concise explanation. Open their "
                "full report in Technical details."
            )
        )
    return {
        "verdict": (header_verdict or explicit_verdict) if valid else None,
        "findings": count,
        "reason": plain_summary(reason),
        "format_issue": None
        if valid
        else (
            "The reviewer’s recommendation could not be confirmed. Their "
            "findings are still available below."
        ),
    }


def double_review_summary(proposal: str, delivery: str, critical: str) -> dict[str, Any]:
    reviews = []
    for role, name, report in [
        ("Reviewer", "Delivery reviewer", delivery),
        ("Critic", "Critical reviewer", critical),
    ]:
        fields = review_fields(report)
        header = f"{fields['verdict'] or 'REVISE'}|{fields['findings']}|{fields['reason']}"
        summary = decision_summary(proposal, report, header)
        reviews.append(
            {
                **summary,
                **fields,
                "role": role,
                "name": name,
                "recommendation": "Ship it"
                if fields["verdict"] == "APPROVE"
                else "Another round"
                if fields["verdict"] == "REVISE"
                else None,
            }
        )
    verdicts = [review["verdict"] for review in reviews]
    disagreement = set(verdicts) == {"APPROVE", "REVISE"}
    approved = all(verdict == "APPROVE" for verdict in verdicts)
    valid = all(verdict is not None for verdict in verdicts)
    if not valid:
        reason = (
            "One reviewer’s recommendation could not be confirmed. "
            "Read both assessments before choosing what to do next."
        )
    elif disagreement:
        reason = "The reviewers disagree. " + next(
            r["reason"] for r in reviews if r["verdict"] == "REVISE"
        )
    elif approved:
        reason = "Both reviewers recommend keeping the result. " + reviews[0]["reason"]
    else:
        reason = "Both reviewers request changes. " + reviews[0]["reason"]
    return {
        "recommendation": "Ship it" if approved else "Another round" if valid else None,
        "reason": plain_summary(reason),
        "worker": first_sentence(proposal),
        "task_issue": any(r["verdict"] is not None and r["task_issue"] for r in reviews),
        "findings": None,  # Counts may overlap; don't invent a deduplicated total.
        "reviewers": reviews,
        "disagreement": disagreement,
    }
