"""Observable local work and protocol envelopes remain separate projections."""

from zippercrew.state import apply_event, initial_state


def event(state, number, kind, **raw):
    apply_event(state, {"id": number, "type": "runtime", "event": {"type": kind, **raw}})


def test_receive_can_be_traced_before_send_and_bindings_can_differ(config):
    state = initial_state("r", config)
    envelope = {"from": "Implementer", "to": "Reviewer", "channel": "work", "seq": 12}
    event(state, 1, "recv", **envelope, bindings={"incoming": "a proposal"})
    event(state, 2, "send", **envelope, bindings={"proposal": "a proposal"})
    (message,) = state["messages"]
    assert message["send_id"] == 2 and message["receive_id"] == 1
    assert message["status"] == "received" and message["label"] == "Proposal"
    assert message["fields"] == ["proposal"]
    # Same number on another channel is a different envelope.
    event(state, 3, "send", **{**envelope, "channel": "other"}, bindings={"task": "do work"})
    assert len(state["messages"]) == 2
    assert state["messages"][1]["status"] == "sent"
    assert state["participants"]["Reviewer"] == "waiting"


def test_control_envelopes_never_expose_private_payloads(config):
    state = initial_state("r", config)
    envelope = {"from": "Human", "to": "Reviewer", "channel": "control", "seq": 3}
    event(state, 1, "send", **envelope, control=True, bindings={})
    event(state, 2, "recv", **envelope, ctrl=True, bindings={"branch": "true"})
    (message,) = state["messages"]
    assert message["control"] and message["label"] == "Control"
    assert message["preview"] == "" and message["status"] == "received"


def test_activity_comes_only_from_observed_action_and_stops_at_boundary(config):
    state = initial_state("r", config)
    action = {"lifeline": "Implementer", "action_kind": "assistant", "action": "implement"}
    event(state, 1, "act_start", **action)
    assert state["local_activity"]["Implementer"]["text"] == "Working on the task…"
    assert state["local_activity"]["Implementer"]["id"] == 1
    assert state["messages"] == []
    event(state, 2, "act", **action, inputs={}, outputs={"proposal": "Ran tests"})
    assert state["local_activity"] == {}
    assert state["messages"] == []  # Completed local output isn't a send.
    event(state, 3, "act_start", **action)
    apply_event(state, {"id": 4, "type": "room.failed", "error": "CLI failed"})
    assert state["local_activity"] == {}


def test_pending_messages_survive_bounded_consumed_history(config):
    state = initial_state("r", config)
    envelope = {"from": "Human", "to": "Reviewer", "channel": "brief"}
    for seq in range(100):
        event(state, seq * 2 + 1, "send", **envelope, seq=seq, bindings={"task": "x" * 1000})
        if seq:
            event(state, seq * 2 + 2, "recv", **envelope, seq=seq, bindings={"task": "x" * 1000})
    assert len(state["messages"]) == 81
    assert state["messages"][0]["receive_id"] is None
    assert len(state["messages"][0]["preview"]) <= 800


def test_actual_pair_programming_communications(config):
    from test_process import APPROVE, REVISE, run_script

    _, _, events, _ = run_script(
        config, [REVISE, APPROVE], ["Another round", "Check zero", "Ship it"]
    )
    state = initial_state("r", config)
    for i, entry in enumerate(events, 1):
        apply_event(state, {**entry, "id": i})
    handoffs = {(m["from"], m["to"], m["label"]) for m in state["messages"]}
    assert {
        ("Human", "Implementer", "Task"),
        ("Human", "Reviewer", "Task"),
        ("Implementer", "Reviewer", "Proposal"),
        ("Implementer", "Human", "Proposal"),
        ("Reviewer", "Human", "Review"),
        ("Human", "Implementer", "Guidance"),
    } <= handoffs
    assert all(m["send_id"] is not None and m["receive_id"] is not None for m in state["messages"])
    assert len({m["id"] for m in state["messages"]}) == len(state["messages"])
