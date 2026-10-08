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
from zippergen import assistant_progress
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


def load_process(workflow: str = "review") -> tuple[Any, ModuleType]:
    if workflow == "direct":
        return load_workflow_spec(f"{Path(__file__).with_name('direct_workflow.py')}:direct")
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
        elif event.get("kind") == "ui_status":
            text = event.get("text")
            if isinstance(text, str) and 0 < len(text) <= 240:
                emit({"type": "assistant.ui_status", **identity, "text": text})
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
        if role == "Reviewer":
            instructions += (
                "\n\n## Human decision summary\n"
                "Keep the required APPROVE/REVISE, FINDINGS, and headline header unchanged. "
                "Make the headline a short plain-language explanation of the main reason "
                "for your verdict, without shell commands or internal jargon. After the full "
                "findings, append <decision-summary> followed by a JSON object and "
                "</decision-summary>. Use these fields: reason (one short sentence explaining "
                "the main reason), worker (one short sentence describing the actual result), "
                "task_needs_clarification (a boolean). Set that flag true only when the task "
                "itself lacks the objective or requirements needed to proceed. Base every "
                "statement on the proposal and evidence you inspected. Do not infer that "
                "no files changed merely because the task was vague. Keep both sentences "
                "under 240 characters. This summary supplements, never replaces, your full "
                "findings; those will still reach the Worker automatically."
            )
        if emit and supports_progress and hasattr(assistant_progress, "UI_STATUS_VERSION"):
            instructions += (
                "\n\n## Public office status\n"
                "Keep the human informed through standalone commentary messages in this format: "
                "<ui-status>your update</ui-status>. Send an initial update before your first "
                "tool call, then update when you have a useful finding, change approach, begin "
                "editing or verification, encounter a blocker, or prepare a handoff. During "
                "long multi-step work, aim to provide a useful update about every 20–30 seconds "
                "at the next opportunity between tool calls. Do not interrupt a running tool "
                "or repeat yourself just to meet a timer. "
                "Use 2–3 compact, natural sentences, usually 120–200 characters total "
                "(240 maximum), in up to 3 paragraphs. Name the concrete object of the work. "
                "Connect what you found or changed to what you are doing next and why it "
                "matters. Describe observed facts and intended next actions; distinguish "
                "a planned check from a completed check. "
                "Worker example: I found the sidebar is constraining the office width. "
                "I’m adjusting the container while preserving the room layout and animations. "
                "Reviewer example: The layout checks pass on desktop. I’m checking narrow "
                "screens next, especially whether the task board stays clickable. "
                "Blocker example: The visual check could not start because Chromium is "
                "unavailable. I’m checking the local browser setup before retrying. "
                "Avoid generic Working/Thinking/Processing messages, lists of tool calls, "
                "raw shell output, secrets, or private reasoning. Do not claim success until "
                "you have evidence. This status channel does not replace the final response: "
                "keep that response in its required output format."
            )
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
