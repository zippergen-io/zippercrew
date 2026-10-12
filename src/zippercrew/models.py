"""Small model picker sourced from local CLI metadata, without assistant calls."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any


def model_choices() -> list[dict[str, Any]]:
    choices: list[dict[str, Any]] = []
    cache = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex") / "models_cache.json"
    try:
        payload = json.loads(cache.read_text())
        models = payload.get("models", []) if isinstance(payload, dict) else []
        for model in models if isinstance(models, list) else []:
            if not isinstance(model, dict) or model.get("visibility") != "list":
                continue
            slug = model.get("slug")
            if not isinstance(slug, str) or not slug:
                continue
            levels = model.get("supported_reasoning_levels", [])
            choices.append(
                {
                    "backend": "codex",
                    "model": slug,
                    "label": str(model.get("display_name") or slug),
                    "efforts": [
                        level["effort"]
                        for level in levels
                        if isinstance(level, dict) and isinstance(level.get("effort"), str)
                    ]
                    if isinstance(levels, list)
                    else [],
                }
            )
    except (OSError, ValueError):
        pass  # A missing/outdated cache leaves the CLI default and saved models available.

    if executable := shutil.which("claude"):
        try:
            result = subprocess.run(
                [executable, "--help"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if result.returncode == 0:
                choices.extend(claude_choices(result.stdout))
        except (OSError, subprocess.TimeoutExpired):
            pass
    return choices


def claude_choices(help_text: str) -> list[dict[str, Any]]:
    """Use aliases/effort levels advertised by the installed CLI, not a dated list."""
    section = re.search(r"--model <[^>]+>(.*?)(?:\n  -|\Z)", help_text, re.S)
    effort = re.search(r"--effort <[^>]+>[^()]*\(([^)]+)\)", help_text)
    levels = [value.strip() for value in effort[1].split(",")] if effort else []
    aliases = re.findall(r"['\"]([a-z][a-z0-9-]*)['\"]", section[1]) if section else []
    return [
        {
            "backend": "claude",
            "model": alias,
            "label": f"Claude {alias.capitalize()}",
            "efforts": levels,
        }
        for alias in dict.fromkeys(aliases)
    ]


def validate_effort(selection: dict[str, Any], choices: list[dict[str, Any]]) -> None:
    """Reject known mismatches, without guessing support for an unknown model."""
    model, effort = selection.get("model"), selection.get("reasoning_effort")
    if not model or not effort:
        return
    for choice in choices:
        if choice["backend"] != selection["backend"] or choice["model"] != model:
            continue
        levels = choice.get("efforts", [])
        if levels and effort not in levels:
            raise ValueError(
                f"{model} does not list reasoning effort '{effort}' in local CLI metadata. "
                f"Choose {', '.join(levels)}, or Default, in the agent settings."
            )
        return
