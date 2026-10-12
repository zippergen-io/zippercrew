"""Trace-derived ordering, including real audit runs with coalesced updates."""

import copy
import json
from pathlib import Path

import pytest

from zippercrew.state import apply_event, initial_state

FIXTURES = Path(__file__).parent / "fixtures" / "causal"


def snapshots(workflow, config):
    state = initial_state("trace-" + workflow, {**config, "workflow": workflow})
    for event in map(json.loads, (FIXTURES / f"{workflow}.jsonl").read_text().splitlines()):
        apply_event(state, event)
        yield copy.deepcopy(state)


def ancestors(nodes, key):
    result = set()
    pending = list(nodes[key].get("after", []))
    while pending:
        predecessor = pending.pop()
        assert predecessor != key, f"Causal cycle at {key}"
        assert predecessor in nodes, f"Missing predecessor {predecessor}"
        if predecessor not in result:
            result.add(predecessor)
            pending.extend(nodes[predecessor].get("after", []))
    return result


@pytest.mark.parametrize("workflow", ["direct", "review", "double_review"])
def test_audit_traces_preserve_role_order_and_every_prior_receive(config, workflow):
    state = list(snapshots(workflow, config))[-1]
    nodes = {m["id"]: m for m in state["messages"] + state["presentation"]}
    received = {}
    for event in map(json.loads, (FIXTURES / f"{workflow}.jsonl").read_text().splitlines()):
        if event["type"] != "runtime":
            continue
        raw = event["event"]
        kind = raw["type"]
        if kind in {"send", "recv"}:
            key = json.dumps([raw["from"], raw["to"], raw.get("channel"), raw.get("seq")])
            if kind == "recv":
                received.setdefault(raw["to"], set()).add(key)
                continue
            before = ancestors(nodes, key)
            assert received.get(raw["from"], set()) <= before
        elif kind == "act_start" and raw.get("action_kind") == "assistant":
            assert received.get(raw["lifeline"], set()) <= ancestors(nodes, f"event:{event['id']}")
    for key in nodes:
        ancestors(nodes, key)


def test_receive_before_send_keeps_unresolved_prerequisites(config):
    state = initial_state("r", config)

    def message(n, kind, sender, recipient, seq, control=False):
        apply_event(
            state,
            {
                "id": n,
                "type": "runtime",
                "event": {
                    "type": kind,
                    "from": sender,
                    "to": recipient,
                    "channel": "test",
                    "seq": seq,
                    "control": control,
                    "bindings": {"task": "test"},
                },
            },
        )

    message(1, "send", "Human", "Implementer", 1)
    message(2, "recv", "Human", "Implementer", 1)
    message(3, "recv", "Implementer", "Reviewer", 2, True)
    message(4, "send", "Reviewer", "Human", 3)
    assert "after" not in state["messages"][1]
    assert state["messages"][1]["id"] in state["messages"][2]["after"]
    message(5, "send", "Implementer", "Reviewer", 2, True)
    nodes = {m["id"]: m for m in state["messages"]}
    assert state["messages"][0]["id"] in ancestors(nodes, state["messages"][2]["id"])
    assert state["messages"][1]["control"]


def test_sending_to_two_roles_does_not_wait_for_the_first_recipient(config):
    state = initial_state("r", config)
    for n, recipient in enumerate(["Reviewer", "Implementer"], 1):
        apply_event(
            state,
            {
                "id": n,
                "type": "runtime",
                "event": {
                    "type": "send",
                    "from": "Human",
                    "to": recipient,
                    "channel": "task",
                    "seq": 1,
                    "bindings": {"task": "test"},
                },
            },
        )
    assert state["messages"][0]["receive_id"] is None
    assert state["messages"][1]["after"] == []


def test_auto_frontiers_stay_small_without_losing_transitive_order(config):
    from test_double_review import REVISE

    from zippercrew.worker import execute

    config.update(workflow="double_review", human_mode="auto", max_rounds=40)
    events = []

    def backend(action, inputs):
        return {action.outputs[0][0]: "A small change." if action.name == "implement" else REVISE}

    execute(config, events.append, lambda request: pytest.fail("Auto asked Human"), backend)
    state = initial_state("long-auto", config)
    sizes = {}
    for n, event in enumerate(events, 1):
        apply_event(state, {**event, "id": n})
        if state["round"] in {20, 40}:
            graph = state["messages"] + state["presentation"]
            sizes[state["round"]] = len(json.dumps([step.get("after", []) for step in graph]))
            assert max(len(step.get("after", [])) for step in graph) <= 5
    assert sizes[40] < 2.5 * sizes[20], sizes
    assert max(map(len, state["presentation_frontiers"].values())) <= 5
    nodes = {node["id"]: node for node in state["messages"] + state["presentation"]}
    received = {}
    for event in events:
        if event["type"] != "runtime":
            continue
        raw = event["event"]
        if raw["type"] not in {"send", "recv"}:
            continue
        key = json.dumps([raw["from"], raw["to"], raw.get("channel"), raw.get("seq")])
        if raw["type"] == "recv":
            received.setdefault(raw["to"], set()).add(key)
        else:
            assert received.get(raw["from"], set()) <= ancestors(nodes, key)
