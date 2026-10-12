"""Conservative summaries of public CLI tools, never inferred agent thoughts."""

from __future__ import annotations

import hashlib
import re
import shlex
from pathlib import PurePosixPath
from typing import Any


def command_words(command: object) -> list[str]:
    """Recognize one command, optionally preceded by a literal ``cd dir &&``.

    This identifies a test *attempt*, not proof that the directory change or
    tests ran. Pipelines, extra operations and shell expansions stay opaque.
    """
    if not isinstance(command, str) or "\n" in command:
        return []
    try:
        outer = shlex.split(command)
        if (
            len(outer) == 3
            and PurePosixPath(outer[0]).name in {"bash", "zsh", "sh"}
            and outer[1] in {"-c", "-lc"}
        ):
            command = outer[2]
        if "\n" in command:
            return []
        lexer = shlex.shlex(command, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        lexer.commenters = ""
        words = list(lexer)
    except ValueError:
        return []
    if words[:1] == ["cd"]:
        directory_index = 2 if words[1:2] == ["--"] else 1
        separator_index = directory_index + 1
        if len(words) <= separator_index + 1 or words[separator_index] != "&&":
            return []
        directory = words[directory_index]
        if (
            not directory
            or directory.startswith("-")
            or any(c in directory for c in ";&|`$<>()\n*?[]{}~")
        ):
            return []
        words = words[separator_index + 1 :]
    if any(any(c in word for c in ";&|`$<>()\n") for word in words):
        return []
    if len(words) > 2 and words[:2] in (["uv", "run"], ["poetry", "run"]):
        words = words[2:]
    return words


def command_kind(command: object) -> str:
    words = command_words(command)
    if not words:
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
        return "format" if "--check" in words else "diff"
    if (name == "ruff" and words[1:2] == ["format"] and "--check" in words) or (
        name in {"black", "prettier"} and "--check" in words
    ):
        return "format"
    if name == "ruff" and words[1:2] == ["check"]:
        return "lint"
    if name in {"mypy", "tsc"}:
        return "types"
    if name in {"npm", "pnpm", "yarn"} and words[1:2] == ["run"]:
        return {"lint": "lint", "typecheck": "types", "build": "build"}.get(
            words[2] if len(words) > 2 else "", "shell"
        )
    if name in {"cat", "head", "tail", "rg", "grep", "ls", "pwd", "sed"}:
        return "files"
    return "shell"


def command_read(command: object) -> tuple[str, str | None] | None:
    words = command_words(command)
    if not words:
        return None
    name = PurePosixPath(words[0]).name
    lines = None
    if name == "sed" and len(words) == 4 and words[1] == "-n":
        match = re.fullmatch(r"(\d{1,6}),(\d{1,6})p", words[2])
        if not match or int(match[1]) <= 0 or int(match[2]) < int(match[1]):
            return None
        lines = f"lines {match[1]}–{match[2]}"
    elif name == "cat" and len(words) == 2 and not words[1].startswith("-"):
        pass
    else:
        return None
    filename = PurePosixPath(words[-1]).name
    if not re.fullmatch(r"[\w.-]{1,60}", filename):
        return None
    if re.search(r"env|secret|credential|token|password|private", filename, re.I):
        return None
    return filename, lines


def summarize(event: dict[str, Any]) -> dict[str, Any] | None:
    """Return bounded display metadata; raw arguments/output never enter scene display metadata."""
    phase = event.get("phase")
    if phase not in {"started", "completed"}:
        return None
    detail: dict[str, Any] = {"phase": phase, "kind": event.get("kind")}
    if event.get("kind") == "command":
        category = command_kind(event.get("command"))
        detail["category"] = category
        # A stable, non-disclosing key lets a successful retry replace the same
        # failed check without erasing unrelated verification gaps.
        if isinstance(event.get("command"), str):
            detail["check_id"] = hashlib.sha256(event["command"].strip().encode()).hexdigest()[:16]
        exit_code = event.get("exit_code")
        failed = event.get("status") == "failed" or event.get("is_error") is True
        blocked = failed and bool(
            re.search(
                r"requires approval|needs approval|permission denied|not permitted|"
                r"permission.*denied",
                str(event.get("output", "")),
                re.I,
            )
        )
        if phase == "completed":
            detail["result"] = (
                "blocked"
                if blocked
                else "failed"
                if failed or type(exit_code) is int and exit_code != 0
                else "succeeded"
                if type(exit_code) is int and exit_code == 0
                else "unknown"
            )
        if isinstance(exit_code, int) and not isinstance(exit_code, bool):
            detail["exit_code"] = exit_code
        if phase == "started":
            text = {
                "tests": "Running tests…",
                "diff": "Checking the diff…",
                "files": "Inspecting repository files…",
                "format": "Checking formatting…",
                "lint": "Checking code quality…",
                "types": "Checking types…",
                "build": "Building the project…",
                "shell": "Running a shell command…",
            }[category]
        elif blocked:
            text = "Test command was blocked." if category == "tests" else "Command was blocked."
        elif failed or "exit_code" in detail and exit_code != 0:
            text = {
                "tests": "Test command failed.",
                "format": "Formatting check failed.",
                "lint": "Code check failed.",
                "types": "Type check failed.",
                "build": "Build failed.",
            }.get(category, "Shell command failed.")
        elif category == "tests" and exit_code == 0:
            text = "Test command succeeded."
        else:
            text = {
                "tests": "Test command finished.",
                "diff": "Diff checked.",
                "files": "Repository inspection finished.",
                "shell": "Command finished.",
                "format": "Formatting checked.",
                "lint": "Code checks finished.",
                "types": "Type check finished.",
                "build": "Build finished.",
            }[category]
        reading = command_read(event.get("command"))
        if reading and (phase == "started" or exit_code == 0 and not failed):
            text = f"Reading {reading[0]}…" if phase == "started" else f"Read {reading[0]}."
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
    if event.get("status") == "failed" or event.get("is_error") is True:
        if re.search(r"requires approval|needs approval", str(event.get("output", "")), re.I):
            return "Approval was required"
        return "Tool reported an error"
    if event.get("kind") == "file" and event.get("operation") == "read":
        offset, limit = event.get("offset"), event.get("limit")
        if type(offset) is int and offset > 0:
            if type(limit) is int and 0 < limit <= 100000:
                return f"lines {offset}–{offset + limit - 1}"
            return f"from line {offset}"
    if event.get("kind") == "command":
        reading = command_read(event.get("command"))
        if reading and reading[1]:
            return reading[1]
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
    if category == "format" and isinstance(command, str):
        words = command_words(command)
        if (
            words
            and PurePosixPath(words[0]).name == "git"
            and "--check" in words
            and event.get("exit_code") == 0
        ):
            return "No whitespace errors"
    if isinstance(output, str):
        lines = [
            re.sub(r"\x1b\[[0-9;]*m", "", line).strip() for line in output[-16000:].splitlines()
        ]
        if category == "tests":
            for line in reversed(lines):
                match = re.fullmatch(
                    r"Tests:\s+((?:\d+ (?:passed|failed|skipped|todo|total)(?:, )?)+)(?:\s*)", line
                )
                if match:
                    return (
                        " · ".join(
                            f"{n} {label}"
                            for n, label in re.findall(r"(\d+) (passed|failed|skipped)", match[1])
                        )
                        or None
                    )
            ran = next(
                (
                    re.fullmatch(r"Ran (\d+) tests? in [\d.]+s", line)
                    for line in lines
                    if re.fullmatch(r"Ran (\d+) tests? in [\d.]+s", line)
                ),
                None,
            )
            if ran and lines[-1:] == ["OK"] and event.get("exit_code") == 0:
                return f"{ran[1]} tests passed"
        if category == "lint" and "All checks passed!" in lines and event.get("exit_code") == 0:
            return "All checks passed"
        if category == "types":
            for line in reversed(lines):
                match = re.fullmatch(r"Success: no issues found in (\d+) source files?", line)
                if match and event.get("exit_code") == 0:
                    return f"{match[1]} files · no type errors"
        if category == "format":
            for line in reversed(lines):
                match = re.fullmatch(r"(\d+) files? already formatted", line)
                if match:
                    return f"{match[1]} files already formatted"
    code = event.get("exit_code")
    if type(code) is int:
        return f"Exit status {code}"
    if event.get("status") == "failed":
        return "Tool reported an error"
    return None
