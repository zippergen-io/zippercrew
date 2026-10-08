"""One isolated Room: JSON lines out, human responses in, no policy loop here."""

from __future__ import annotations

import json
import os
import queue
import signal
import sys
import threading
import time
import uuid
from typing import Any

from zippergen.human_tasks import build_human_task_spec, human_task_result_from_value
from zippergen.runtime import run

from zippercrew.adapter import assistant_backend, load_process
from zippercrew.decisions import decision_summary
from zippercrew.workflows import agent_roles, workflow_id


def execute(config: dict[str, Any], emit: Any, answer: Any, backend: Any = None) -> str:
    workflow, module = load_process(workflow_id(config))
    proposal, critique, header = "", "", None
    bundled_note: tuple[str, str] | None = None

    def trace(event: dict[str, Any]) -> None:
        nonlocal proposal, critique, header
        emit({"type": "runtime", "event": event})
        if event["type"] == "act" and event.get("action") == "implement":
            proposal = str(next(iter(event["outputs"].values())))
            critique, header = "", None
        if event["type"] == "act" and event.get("action") == "review":
            critique = next(iter(event["outputs"].values()))
            header = module.review_header.fn(critique)
            verdict, findings, headline = header.split("|", 2)
            emit(
                {
                    "type": "review.verdict",
                    "verdict": verdict,
                    "findings": findings,
                    "headline": headline,
                }
            )

    def human(action: Any, inputs: dict[str, object]) -> dict[str, object]:
        nonlocal bundled_note
        spec = build_human_task_spec(action, inputs)
        if action.name == "ask_note" and bundled_note is not None:
            parent, saved_note = bundled_note
            bundled_note = None
            result = human_task_result_from_value(spec, saved_note)
            emit({"type": "human.note_applied", "request_id": parent, "value": saved_note})
            return result
        request = {"id": uuid.uuid4().hex, "action": action.name, "spec": spec}
        if spec["kind"] == "select":
            request["summary"] = decision_summary(proposal, critique, header)
        emit({"type": "human.required", "request": request})
        value = answer(request)
        note = None
        if isinstance(value, dict):
            value, note = value["value"], value.get("note")
            if value != "Another round" or not isinstance(note, str):
                raise ValueError("Only Another round accepts a bundled text note.")
            bundled_note = (request["id"], note)
        result = human_task_result_from_value(spec, value)
        event = {"type": "human.responded", "request_id": request["id"], "value": value}
        if note is not None:
            event["note"] = note
        emit(event)
        return result

    result = run(
        workflow,
        [module.Human, *(getattr(module, role) for role in agent_roles(config))],
        {
            "Human": {
                "task": config["task"],
                "max_rounds": config["max_rounds"],
                "detail": config["human_mode"],
            }
        },
        assistant_backend=backend or assistant_backend(config, emit),
        human_backend=human,
        trace=trace,
        timeout=0,
    )
    return str(result)


def main() -> None:
    config = json.loads(sys.stdin.readline())
    lock = threading.Lock()
    responses: queue.Queue[dict[str, Any]] = queue.Queue()

    def read_responses() -> None:
        # EOF means the owning service has gone away, including a hard crash.
        # Stop the whole Room group so an orphan CLI cannot keep editing files.
        try:
            for line in sys.stdin:
                responses.put(json.loads(line))
        finally:
            os.killpg(os.getpgrp(), signal.SIGTERM)

    threading.Thread(target=read_responses, daemon=True).start()

    def emit(event: dict[str, Any]) -> None:
        with lock:
            print(json.dumps(event), flush=True)

    def answer(request: dict[str, Any]) -> Any:
        payload = responses.get()
        if payload["request_id"] != request["id"]:
            raise ValueError("Response belongs to a different human request.")
        return payload if "note" in payload else payload["value"]

    round_number = 0

    def demo(action: Any, inputs: dict[str, object]) -> dict[str, object]:
        nonlocal round_number
        # Keep scripted phases legible in the demo/browser walkthrough.
        # Real CLI actions have no artificial delay.
        time.sleep(float(os.environ.get("ZIPPERCREW_DEMO_TURN_SECONDS", "1.5")))
        if action.name == "implement":
            round_number += 1
            value = f"Demo proposal, round {round_number}.\n\nNo files were changed."
        else:
            verdict = "REVISE" if round_number == 1 else "APPROVE"
            value = (
                f"{verdict}\nFINDINGS: {int(round_number == 1)}\n"
                "Demo review of the proposal.\n\nScripted participant; no CLI was called."
            )
        return {action.outputs[0][0]: value}

    try:
        outcome = execute(config, emit, answer, demo if config.get("demo") else None)
        emit({"type": "room.completed", "outcome": outcome})
    except BaseException as exc:
        emit({"type": "room.failed", "error": f"{type(exc).__name__}: {exc}"})
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
