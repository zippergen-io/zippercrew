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
        "active_calls": {},
        "progress": [],
        "verification_checks": {},
        "messages": [],
        "presentation": [],
        "presentation_frontiers": {},
    }


def apply_event(state: dict[str, Any], event: dict[str, Any]) -> None:
    kind = event["type"]
    state["version"] = event["id"]
    if kind == "room.started":
        state["status"] = "running"
    elif kind == "room.pausing":
        state["status"] = "pausing"
    elif kind == "room.paused":
        state["status"] = "paused"
    elif kind == "room.resumed":
        state["status"] = "running"
    elif kind == "assistant.call_started":
        state.setdefault("active_calls", {})[event["call_id"]] = {
            "role": event["role"],
            "action": event["action"],
        }
    elif kind == "assistant.call_finished":
        state.setdefault("active_calls", {}).pop(event["call_id"], None)
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
                "after": frontier(state, role),
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
                "after": frontier(state, role),
            }
            state["local_activity"][role] = activity
            state["progress"] = [*state["progress"], activity][-40:]
            if activity.get("phase") == "completed" and activity.get("kind") == "command":
                key = f"{role}:{activity.get('check_id') or activity.get('tool_id') or event['id']}"
                checks = state.setdefault("verification_checks", {})
                # Only a successful retry of the same command replaces its
                # failure. Collection roots and filenames do not prove coverage.
                if (
                    activity.get("category") == "tests"
                    or activity.get("result") == "blocked"
                    or key in checks
                ):
                    checks[key] = activity
    elif kind == "human.required":
        # A natural decision consumes a pending pause without pretending the
        # user resumed the run. Keep journal replay identical to live state.
        if state["status"] in {"pausing", "paused"}:
            state["status"] = "running"
        state["pending"] = {**event["request"], "after": frontier(state, "Human")}
        if isinstance(state["pending"].get("summary"), dict):
            summary = dict(state["pending"]["summary"])
            gaps = list(summary.get("verification", []))
            labels = {
                "Implementer": "Worker",
                "Reviewer": "Reviewer",
                "Critic": "Critical reviewer",
            }
            for check in state.get("verification_checks", {}).values():
                if check["round"] != state["round"] or check.get("result") not in {
                    "blocked",
                    "failed",
                    "unknown",
                }:
                    continue
                label = labels.get(check["role"], check["role"])
                gap = f"{label}: " + (
                    "Command result could not be confirmed."
                    if check.get("result") == "unknown"
                    else check["text"]
                )
                later_success = check.get("category") == "tests" and any(
                    later["role"] == check["role"]
                    and later["round"] == check["round"]
                    and later["id"] > check["id"]
                    and later.get("category") == "tests"
                    and later.get("result") == "succeeded"
                    for later in state.get("verification_checks", {}).values()
                )
                if later_success:
                    earlier = {
                        "failed": "An earlier test command failed.",
                        "blocked": "An earlier test command was blocked.",
                        "unknown": "An earlier test command's result was unconfirmed.",
                    }[check["result"]]
                    gap = (
                        f"{label}: {earlier} A later test command succeeded, "
                        "but a successful rerun of that check is unconfirmed."
                    )
                elif check.get("detail"):
                    gap += f" {check['detail']}."
                if gap not in gaps:
                    gaps.append(gap)
            summary["verification"] = gaps
            state["pending"]["summary"] = summary
        state["participants"]["Human"] = "needs human"
    elif kind == "human.responded":
        state["pending"] = None
        state["participants"]["Human"] = "waiting"
        state["transcript"].append(
            {
                "role": "Human",
                "round": state["round"],
                "action": "response",
                "outputs": {
                    "answer": event["value"],
                    **({"note": event["note"]} if "note" in event else {}),
                },
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
        state["active_calls"] = {}
    elif kind == "runtime":
        raw = event["event"]
        role = raw.get("lifeline")
        action_kind = raw.get("action_kind")
        if raw["type"] == "act_start" and action_kind == "assistant":
            if role == "Implementer":
                state["round"] += 1
                state["review"] = None
                state["verification_checks"] = {}
            state["participants"][role] = (
                "reviewing" if role in {"Reviewer", "Critic"} else "working"
            )
            state.setdefault("room_status", {}).pop(role, None)
            # Action-start fallback, replaced only by observed public tool progress.
            state["local_activity"][role] = {
                "id": event["id"],
                "text": {
                    "review_delivery": (
                        "Checking the result against the task.\nLooking for missing "
                        "requirements and unnecessary complexity."
                    ),
                    "review_critical": (
                        "Checking assumptions and edge cases.\nLooking for evidence of "
                        "regressions or unsupported claims."
                    ),
                    "respond_delivery": (
                        "Comparing the two independent reviews.\nChecking which "
                        "objections really block delivery."
                    ),
                    "respond_critical": (
                        "Checking the delivery review against the evidence.\nKeeping "
                        "supported concerns and withdrawing disproven ones."
                    ),
                }.get(
                    raw["action"],
                    "Reviewing the proposal…"
                    if role in {"Reviewer", "Critic"}
                    else "Working on the task…",
                ),
                "source": "runtime.act_start",
                "action": raw["action"],
                "round": state["round"],
            }
            step = project_role(state, event, role, state["participants"][role])
            step["activity"] = dict(state["local_activity"][role])
            state["local_activity"][role]["after"] = [step["id"]]
        elif raw["type"] == "act" and action_kind in {"assistant", "human"}:
            state["participants"][role] = "waiting"
            state["local_activity"].pop(role, None)
            state.setdefault("room_status", {}).pop(role, None)
            state["invocations"].pop(role, None)
            project_role(state, event, role, "waiting")
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


def frontier(state: dict[str, Any], role: str) -> list[str]:
    """Keep an antichain, not every receipt since the role's last action.

    Auto-mode Humans may never execute an action. A recent review already covers
    their earlier receipts transitively. Repeating those ancestors in each send
    makes snapshots quadratic. Unresolved recv-before-send nodes are retained
    conservatively and reconsidered once their send supplies its dependencies.
    """
    frontiers = state.setdefault("presentation_frontiers", {})
    candidates = list(dict.fromkeys(frontiers.get(role, [])))
    if len(candidates) < 2:
        return candidates
    nodes = {node["id"]: node for node in [*state["messages"], *state["presentation"]]}
    redundant: set[str] = set()
    for candidate in candidates:
        targets = set(candidates) - {candidate}
        pending = list(nodes.get(candidate, {}).get("after", []))
        visited: set[str] = set()
        while pending and targets:
            key = pending.pop()
            if key in visited:
                continue
            visited.add(key)
            if key in targets:
                redundant.add(key)
                targets.remove(key)
            pending.extend(nodes.get(key, {}).get("after", []))
    frontiers[role] = [key for key in candidates if key not in redundant]
    return list(frontiers[role])


def project_role(
    state: dict[str, Any], event: dict[str, Any], role: str, status: str
) -> dict[str, Any]:
    step = {
        "id": f"event:{event['id']}",
        "order": event["id"],
        "role": role,
        "state": status,
        "after": frontier(state, role),
    }
    state.setdefault("presentation", []).append(step)
    state["presentation_frontiers"][role] = [step["id"]]
    return step


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
    if raw["type"] == "send":
        # Per-role trace order is authoritative, not wall time or workflow type.
        # A recv can be logged before its send. Its placeholder remains unresolved
        # until this send supplies the sender's prerequisites.
        message["after"] = frontier(state, raw["from"])
        # Sending does not wait for the remote receive. In particular, sending
        # tasks to two roles must not make one role wait for the other's receipt.
        # Receives and local work advance the frontier, outgoing sends do not.
    else:
        state["presentation_frontiers"][raw["to"]] = list(
            dict.fromkeys([*frontier(state, raw["to"]), key])
        )
        frontier(state, raw["to"])
    # Sending names describe the envelope; receive binding names may differ.
    if raw["type"] == "send" or message["send_id"] is None:
        fields = list(raw.get("bindings", {}))
        control = bool(raw.get("control") or raw.get("ctrl"))
        titles = {
            "task": "Task",
            "proposal": "Proposal",
            "critique": "Review",
            "guidance": "Guidance",
            "delivery": "Delivery review",
            "critical": "Critical review",
            "delivery_final": "Delivery response",
            "critical_final": "Critical response",
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
    # Keep lightweight graph nodes for merged snapshots and transitive ordering.
    # Older payload previews are expendable, their causal identities are not.
    consumed = [m for m in messages if m["send_id"] and m["receive_id"]]
    for old in consumed[:-80]:
        old["preview"] = ""
