"""Presentation state is a projection of protocol events, never of silence."""

from __future__ import annotations

import json
from typing import Any

from zippercrew.workflows import WORKFLOWS, agent_roles, workflow_id

TERMINAL = {"completed", "failed", "stopped"}
ROLES = ("Implementer", "Reviewer", "Human")


def initial_state(room_id: str, config: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": room_id,
        "process": WORKFLOWS[workflow_id(config)]["name"],
        "environment": "The corner café",
        "config": config,
        "status": "starting",
        "round": 0,
        "version": 0,
        "participants": {role: "waiting" for role in [*agent_roles(config), "Human"]},
        "pending": None,
        "outcome": None,
        "error": None,
        "review": None,
        "transcript": [],
        "activity": [],
        "local_activity": {},
        "room_status": {},
        "invocations": {},
        "progress": [],
        "messages": [],
    }


def apply_event(state: dict[str, Any], event: dict[str, Any]) -> None:
    kind = event["type"]
    state["version"] = event["id"]
    if kind == "room.started":
        state["status"] = "running"
    elif kind == "assistant.invocation":
        if state["participants"].get(event["role"]) in {"working", "reviewing"}:
            state["invocations"][event["role"]] = event["invocation_id"]
    elif kind == "assistant.ui_status":
        role = event["role"]
        text = event.get("text")
        if (
            state["participants"].get(role) in {"working", "reviewing"}
            and state["invocations"].get(role) == event["invocation_id"]
            and isinstance(text, str)
            and 0 < len(text) <= 240
        ):
            status = {
                "id": event["id"],
                "role": role,
                "round": state["round"],
                "kind": "status",
                "text": text,
                "source": kind,
                "invocation_id": event["invocation_id"],
            }
            state.setdefault("room_status", {})[role] = status
            state["progress"] = [*state["progress"], status][-40:]
    elif kind == "assistant.progress":
        role = event["role"]
        if (
            state["participants"].get(role) in {"working", "reviewing"}
            and state["invocations"].get(role) == event["invocation_id"]
        ):
            activity = {
                **event["activity"],
                "id": event["id"],
                "role": role,
                "round": state["round"],
                "source": "assistant.progress",
                "invocation_id": event["invocation_id"],
            }
            state["local_activity"][role] = activity
            state["progress"] = [*state["progress"], activity][-40:]
    elif kind == "human.required":
        state["pending"] = event["request"]
        state["participants"]["Human"] = "needs human"
    elif kind == "human.responded":
        state["pending"] = None
        state["participants"]["Human"] = "waiting"
        state["transcript"].append(
            {
                "role": "Human",
                "round": state["round"],
                "action": "response",
                "outputs": {"answer": event["value"]},
            }
        )
    elif kind == "review.verdict":
        state["review"] = {key: event[key] for key in ("verdict", "findings", "headline")}
    elif kind in {"room.completed", "room.failed", "room.stopped"}:
        state["status"] = kind.split(".")[1]
        state["pending"] = None
        state["outcome"] = event.get("outcome")
        state["error"] = event.get("error")
        state["participants"] = {role: state["status"] for role in state["participants"]}
        state["local_activity"] = {}
        state["room_status"] = {}
        state["invocations"] = {}
    elif kind == "runtime":
        raw = event["event"]
        role = raw.get("lifeline")
        action_kind = raw.get("action_kind")
        if raw["type"] == "act_start" and action_kind == "assistant":
            if role == "Implementer":
                state["round"] += 1
                state["review"] = None
            state["participants"][role] = "reviewing" if role == "Reviewer" else "working"
            state.setdefault("room_status", {}).pop(role, None)
            # Action-start fallback, replaced only by observed public tool progress.
            state["local_activity"][role] = {
                "id": event["id"],
                "text": "Reviewing the proposal…" if role == "Reviewer" else "Working on the task…",
                "source": "runtime.act_start",
                "action": raw["action"],
                "round": state["round"],
            }
        elif raw["type"] == "act" and action_kind in {"assistant", "human"}:
            state["participants"][role] = "waiting"
            state["local_activity"].pop(role, None)
            state.setdefault("room_status", {}).pop(role, None)
            state["invocations"].pop(role, None)
            if action_kind == "assistant":
                state["transcript"].append(
                    {
                        "role": role,
                        "round": state["round"],
                        "action": raw["action"],
                        "inputs": raw["inputs"],
                        "outputs": raw["outputs"],
                    }
                )
        if raw["type"] in {"send", "recv"}:
            project_message(state, event)
            state["activity"].append(
                {
                    "id": event["id"],
                    "type": raw["type"],
                    "from": raw["from"],
                    "to": raw["to"],
                    "fields": list(raw.get("bindings", {})),
                }
            )
            state["activity"] = state["activity"][-20:]


def project_message(state: dict[str, Any], event: dict[str, Any]) -> None:
    """Correlate the runtime's channel sequence; tracing may report recv first.

    A receive consumes a channel item. Animation arrival is never a receipt.
    No workflow-specific routes or inferred recipients belong in this projection.
    """
    raw = event["event"]
    key = json.dumps([raw["from"], raw["to"], raw.get("channel"), raw.get("seq")])
    messages = state["messages"]
    message = next((m for m in messages if m["id"] == key), None)
    if message is None:
        message = {
            "id": key,
            "from": raw["from"],
            "to": raw["to"],
            "channel": raw.get("channel"),
            "seq": raw.get("seq"),
            "send_id": None,
            "receive_id": None,
            "round": state["round"],
        }
        messages.append(message)
    message["send_id" if raw["type"] == "send" else "receive_id"] = event["id"]
    message["version"] = event["id"]
    message["status"] = "received" if message["receive_id"] is not None else "sent"
    # Sending names describe the envelope; receive binding names may differ.
    if raw["type"] == "send" or message["send_id"] is None:
        fields = list(raw.get("bindings", {}))
        control = bool(raw.get("control") or raw.get("ctrl"))
        titles = {
            "task": "Task",
            "proposal": "Proposal",
            "critique": "Review",
            "guidance": "Guidance",
        }
        message.update(
            fields=fields,
            control=control,
            label="Control"
            if control
            else next(
                (titles[f] for f in fields if f in titles),
                ", ".join(fields)[:60] or "Message",
            ),
            # Only a bounded preview travels in snapshots, never a second full trace.
            preview=""
            if control
            else json.dumps(raw.get("bindings", {}), ensure_ascii=False)[:800],
        )
    # Preserve all outstanding sends; bound only consumed history.
    consumed = [m for m in messages if m["send_id"] and m["receive_id"]]
    evicted = {m["id"] for m in consumed[:-80]}
    state["messages"] = [m for m in messages if m["id"] not in evicted]
