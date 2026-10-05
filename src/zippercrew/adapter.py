"""The small, explicit boundary to the sibling ZipperGen checkout."""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import replace
from inspect import signature
from pathlib import Path
from types import ModuleType
from typing import Any

import zippergen
from zippergen.assistant_backends import make_cli_assistant_backend
from zippergen.workflow_io import load_workflow_spec, project_directory

from zippercrew.activity import summarize

ROLE_ACTIONS = {"implement": "Implementer", "review": "Reviewer"}


def source_root() -> Path:
    default = Path(zippergen.__file__).resolve().parents[2]
    root = Path(os.environ.get("ZIPPERGEN_SOURCE", str(default))).expanduser().resolve()
    if not (root / "examples/pair_programming.py").is_file():
        raise ValueError(
            "ZipperCrew needs the ZipperGen source checkout. Run uv sync with ../zippergen "
            "present, or set ZIPPERGEN_SOURCE to its checkout directory."
        )
    return root


def load_process() -> tuple[Any, ModuleType]:
    # Example prompt files are project-relative. Room workers isolate this cwd
    # change from the HTTP service and from every other execution.
    with project_directory(source_root()):
        return load_workflow_spec("examples/pair_programming.py:pair_programming")


def assistant_backend(
    config: dict[str, Any],
    emit: Callable[[dict[str, Any]], None] | None = None,
) -> Callable[..., dict[str, object]]:
    def observe(role: str, event: dict[str, Any]) -> None:
        if emit is None:
            return
        identity = {"role": role, "invocation_id": event["invocation_id"]}
        if event.get("kind") == "invocation.started":
            emit({"type": "assistant.invocation", **identity})
        else:
            if event.get("kind") == "command" and isinstance(event.get("output"), str):
                emit(
                    {
                        "type": "assistant.tool_output",
                        **identity,
                        "tool_id": event.get("tool_id"),
                        "output": event["output"],
                        "truncated": bool(event.get("output_truncated")),
                    }
                )
            activity = summarize(event)
            if activity:
                emit({"type": "assistant.progress", **identity, "activity": activity})

    # One native backend per role, constructed once per Room. The runtime's role
    # thread names supply participant identity to these upstream callables.
    # Keep older sibling checkouts usable with action-boundary bubbles only.
    supports_progress = "on_progress" in signature(make_cli_assistant_backend).parameters
    backends = {
        role: make_cli_assistant_backend(
            {
                key: binding[key]
                for key in ("backend", "model", "reasoning_effort")
                if binding.get(key)
            },
            project_root=config["workspace"],
            **(
                {"on_progress": lambda event, role=role: observe(role, event)}
                if emit and supports_progress
                else {}
            ),
        )
        for role, binding in config["agents"].items()
    }

    def invoke(action: Any, inputs: dict[str, object]) -> dict[str, object]:
        role = ROLE_ACTIONS[action.name]
        binding = config["agents"][role]
        if action.access != ("write" if role == "Implementer" else "read-only"):
            raise ValueError("The upstream pair-programming permission contract changed.")
        instructions = action.instructions
        if binding.get("instructions"):
            instructions += "\n\n## Additional role instructions\n" + binding["instructions"]
        # Claude's shell has no structural read-only filesystem boundary. Keep
        # only Read/Glob/Grep on this role; Codex has an actual read-only sandbox.
        shell = (
            "restricted" if role == "Reviewer" and binding["backend"] == "claude" else action.shell
        )
        effective = replace(
            action, workspace=config["workspace"], instructions=instructions, shell=shell
        )
        return backends[role](effective, inputs)  # type: ignore[no-any-return]

    return invoke
