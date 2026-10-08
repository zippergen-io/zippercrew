"""Concise decision copy from actual participant output, never invented findings."""

from __future__ import annotations

import json
import re
from typing import Any

SUMMARY_TAG = re.compile(r"<decision-summary>\s*(.*?)\s*</decision-summary>", re.S)


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
    match = SUMMARY_TAG.search(critique)
    if match:
        try:
            data = json.loads(match[1])
        except (ValueError, TypeError):
            data = None
        if isinstance(data, dict):
            for key in ("reason", "worker"):
                if isinstance(data.get(key), str) and data[key].strip():
                    summary[key] = plain_summary(data[key])
            summary["task_issue"] = valid and data.get("task_needs_clarification") is True
    return summary
