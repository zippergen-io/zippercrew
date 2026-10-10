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
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Any

from zippergen.human_tasks import build_human_task_spec, human_task_result_from_value
from zippergen.runtime import run

from zippercrew.adapter import ROLE_ACTIONS, assistant_backend, load_process
from zippercrew.decisions import decision_summary, double_review_summary
from zippercrew.workflows import agent_roles, workflow_id


class CallGate:
    """Ask the owning server before each CLI invocation, without stopping processes."""

    def __init__(self, emit: Callable[[dict[str, Any]], None]) -> None:
        self.emit = emit
        self.lock = threading.Lock()
        self.tickets: dict[str, threading.Event] = {}

    def allow(self, call_id: str) -> None:
        with self.lock:
            self.tickets[call_id].set()

    @contextmanager
    def admit(self, role: str, action: str) -> Iterator[None]:
        call_id, ready = uuid.uuid4().hex, threading.Event()
        with self.lock:
            self.tickets[call_id] = ready
        self.emit(
            {"type": "assistant.call_requested", "call_id": call_id, "role": role, "action": action}
        )
        ready.wait()
        try:
            yield
        finally:
            with self.lock:
                self.tickets.pop(call_id)
            self.emit({"type": "assistant.call_finished", "call_id": call_id})


def execute(
    config: dict[str, Any],
    emit: Any,
    answer: Any,
    backend: Any = None,
    *,
    call_scope: Callable[[str, str], AbstractContextManager[None]] | None = None,
) -> str:
    workflow, module = load_process(workflow_id(config))
    proposal, critique, header = "", "", None
    pair_summary = None
    bundled_note: tuple[str, str] | None = None

    def trace(event: dict[str, Any]) -> None:
        nonlocal proposal, critique, header, pair_summary
        emit({"type": "runtime", "event": event})
        if event["type"] == "act" and event.get("action") == "implement":
            proposal = str(next(iter(event["outputs"].values())))
            critique, header = "", None
            pair_summary = None
        if event["type"] == "act" and event.get("action") in {"review", "combine_reviews"}:
            critique = next(iter(event["outputs"].values()))
            if event["action"] == "combine_reviews":
                pair_summary = double_review_summary(
                    proposal, event["inputs"]["delivery_final"], event["inputs"]["critical_final"]
                )
                verdict = "APPROVE" if pair_summary["recommendation"] == "Ship it" else "REVISE"
                header = f"{verdict}|?|{pair_summary['reason']}"
            else:
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
            request["summary"] = pair_summary or decision_summary(proposal, critique, header)
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

    if backend is None:
        invocation = assistant_backend(config, emit, call_scope=call_scope)
    else:

        def invocation(action: Any, inputs: dict[str, object]) -> dict[str, object]:
            if call_scope:
                with call_scope(ROLE_ACTIONS[action.name], action.name):
                    return backend(action, inputs)
            return backend(action, inputs)

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
        assistant_backend=invocation,
        human_backend=human,
        trace=trace,
        timeout=0,
    )
    return str(result)


def main() -> None:
    config = json.loads(sys.stdin.readline())
    # An already-running pre-upgrade server cannot grant call permits. It keeps
    # its old transport until restart instead of stranding a freshly spawned worker.
    cooperative = config.pop("_cooperative_pause", False)
    lock = threading.Lock()
    responses: queue.Queue[dict[str, Any]] = queue.Queue()

    def read_responses() -> None:
        # EOF means the owning service has gone away, including a hard crash.
        # Stop the whole Room group so an orphan CLI cannot keep editing files.
        try:
            for line in sys.stdin:
                payload = json.loads(line)
                if payload.get("control") == "call_allowed":
                    gate.allow(payload["call_id"])
                else:
                    responses.put(payload)
        finally:
            os.killpg(os.getpgrp(), signal.SIGTERM)

    def emit(event: dict[str, Any]) -> None:
        with lock:
            print(json.dumps(event), flush=True)

    gate = CallGate(emit)
    threading.Thread(target=read_responses, daemon=True).start()

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
            if config.get("workflow") == "double_review" and action.name.endswith("delivery"):
                verdict = "APPROVE"
            value = (
                f"{verdict}\nFINDINGS: {int(verdict == 'REVISE')}\n"
                "Demo review of the proposal.\n\nScripted participant; no CLI was called."
            )
        return {action.outputs[0][0]: value}

    try:
        outcome = execute(
            config,
            emit,
            answer,
            demo if config.get("demo") else None,
            call_scope=gate.admit if cooperative else None,
        )
        emit({"type": "room.completed", "outcome": outcome})
    except BaseException as exc:
        emit({"type": "room.failed", "error": f"{type(exc).__name__}: {exc}"})
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
