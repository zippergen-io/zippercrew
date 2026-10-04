"""Presentation state is a projection of protocol events, never of silence."""

from __future__ import annotations

from typing import Any

TERMINAL = {"completed", "failed", "stopped"}
ROLES = ("Implementer", "Reviewer", "Human")


def initial_state(room_id: str, config: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": room_id,
        "process": "Pair Programming",
        "environment": "The corner café",
        "config": config,
        "status": "starting",
        "round": 0,
        "version": 0,
        "participants": {role: "waiting" for role in ROLES},
        "pending": None,
        "outcome": None,
        "error": None,
        "review": None,
        "transcript": [],
        "activity": [],
    }


def apply_event(state: dict[str, Any], event: dict[str, Any]) -> None:
    kind = event["type"]
    state["version"] = event["id"]
    if kind == "room.started":
        state["status"] = "running"
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
        state["participants"] = {role: state["status"] for role in ROLES}
    elif kind == "runtime":
        raw = event["event"]
        role = raw.get("lifeline")
        action_kind = raw.get("action_kind")
        if raw["type"] == "act_start" and action_kind == "assistant":
            if role == "Implementer":
                state["round"] += 1
                state["review"] = None
            state["participants"][role] = "reviewing" if role == "Reviewer" else "working"
        elif raw["type"] == "act" and action_kind in {"assistant", "human"}:
            state["participants"][role] = "waiting"
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
        if raw["type"] in {"send", "recv"} and not raw.get("control"):
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
