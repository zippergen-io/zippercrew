"""Conservative summaries of public CLI tools, never inferred agent thoughts."""

from __future__ import annotations

import re
import shlex
from pathlib import PurePosixPath
from typing import Any


def command_kind(command: object) -> str:
    if not isinstance(command, str):
        return "shell"
    try:
        words = shlex.split(command)
        if (
            len(words) == 3
            and PurePosixPath(words[0]).name in {"bash", "zsh", "sh"}
            and words[1] in {"-c", "-lc"}
        ):
            words = shlex.split(words[2])
    except ValueError:
        return "shell"
    if not words:
        return "shell"
    # Compound commands, substitutions and pipelines aren't parsed as a made-up
    # execution plan. We can truthfully report their enclosing shell invocation.
    if any(any(c in word for c in ";&|`$<>()\n") for word in words):
        return "shell"
    name = PurePosixPath(words[0]).name
    if (
        name in {"pytest", "pytest-3"}
        or (
            re.fullmatch(r"python(?:\d+(?:\.\d+)?)?", name)
            and words[1:3] in (["-m", "pytest"], ["-m", "unittest"])
        )
        or (name in {"npm", "pnpm", "yarn"} and words[1:2] == ["test"])
    ):
        return "tests"
    if name == "git" and words[1:2] == ["diff"]:
        return "diff"
    if name in {"cat", "head", "tail", "rg", "grep", "ls", "pwd"}:
        return "files"
    return "shell"


def summarize(event: dict[str, Any]) -> dict[str, Any] | None:
    """Return bounded display metadata; raw arguments/output never enter scene display metadata."""
    phase = event.get("phase")
    if phase not in {"started", "completed"}:
        return None
    detail: dict[str, Any] = {"phase": phase, "kind": event.get("kind")}
    if event.get("kind") == "command":
        category = command_kind(event.get("command"))
        detail["category"] = category
        exit_code = event.get("exit_code")
        if isinstance(exit_code, int) and not isinstance(exit_code, bool):
            detail["exit_code"] = exit_code
        if phase == "started":
            text = {
                "tests": "Running tests…",
                "diff": "Checking the diff…",
                "files": "Inspecting repository files…",
                "shell": "Running a shell command…",
            }[category]
        elif "exit_code" in detail and exit_code != 0:
            text = "Test command failed." if category == "tests" else "Shell command failed."
        elif category == "tests" and exit_code == 0:
            text = "Test command succeeded."
        else:
            text = {
                "tests": "Test command finished.",
                "diff": "Diff checked.",
                "files": "Repository inspection finished.",
                "shell": "Command finished.",
            }[category]
    elif event.get("kind") == "file":
        operation = event.get("operation")
        name = PurePosixPath(str(event.get("path") or "").replace("\\", "/")).name
        name = "".join(c for c in name if c.isprintable())[:45]
        detail.update(operation=operation, file=name)
        if event.get("status") == "failed":
            text = "File update failed."
        elif operation in {"read", "glob", "grep"}:
            text = (
                f"Reading {name}…"
                if operation == "read" and name
                else "Inspecting repository files…"
            )
        elif operation in {"add", "delete", "update", "edit", "write"}:
            if operation == "delete":
                verb = "Removed" if phase == "completed" else "Removing"
            elif operation == "add":
                verb = "Created" if phase == "completed" else "Creating"
            else:
                verb = "Updated" if phase == "completed" else "Editing"
            text = f"{verb} {name or 'repository files'}" + ("." if phase == "completed" else "…")
        else:
            return None
    else:
        return None
    snippet = result_detail(event)
    if snippet:
        detail["detail"] = snippet[:80]
    detail["text"] = text
    if isinstance(event.get("tool_id"), str):
        detail["tool_id"] = event["tool_id"][:120]
    return detail


def result_detail(event: dict[str, Any]) -> str | None:
    """Only grammar-checked metrics enter bubbles, never an arbitrary output line."""
    if event.get("kind") == "file" and event.get("operation") == "read":
        offset, limit = event.get("offset"), event.get("limit")
        if type(offset) is int and offset > 0:
            if type(limit) is int and 0 < limit <= 100000:
                return f"lines {offset}–{offset + limit - 1}"
            return f"from line {offset}"
    if event.get("kind") != "command" or event.get("phase") != "completed":
        return None
    category = command_kind(event.get("command"))
    output = event.get("output")
    if category == "tests" and isinstance(output, str):
        # Pytest's final summary grammar. No filenames, assertion values, URLs,
        # environment variables or arbitrary failure lines can pass this filter.
        for line in reversed(output[-16000:].splitlines()):
            clean = re.sub(r"\x1b\[[0-9;]*m", "", line).strip(" =")
            match = re.fullmatch(
                r"((?:\d+ (?:passed|failed|skipped|error|errors|xfailed|xpassed|"
                r"deselected|warnings?)"
                r"(?:, )?)+)(?: in [\d.]+s(?: \(.*\))?)?",
                clean,
            )
            if match:
                pairs = re.findall(
                    r"(\d+) (passed|failed|skipped|errors?|xfailed|xpassed)", match[1]
                )
                if pairs:
                    return " · ".join(f"{n} {label}" for n, label in pairs[:3])[:80]
    command = event.get("command")
    if category == "diff" and isinstance(command, str):
        try:
            words = shlex.split(command)
            if len(words) == 3 and words[1] in {"-c", "-lc"}:
                words = shlex.split(words[2])
        except ValueError:
            words = []
        if "--check" in words and event.get("exit_code") == 0:
            return "No whitespace errors"
    code = event.get("exit_code")
    if type(code) is int:
        return f"Exit status {code}"
    if event.get("status") == "failed":
        return "Tool reported an error"
    return None
