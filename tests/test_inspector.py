"""Protocol conversation, readable payloads and local activity stay separate."""

import json

import pytest
from playwright.sync_api import expect, sync_playwright

from zippercrew.state import apply_event, initial_state

pytestmark = pytest.mark.browser


def journal_fixture(config):
    config["max_rounds"] = 4
    config["agents"]["Reviewer"].update(profile="reviewer-agent-claude", backend="claude")
    state = initial_state("a" * 32, config)
    events = []

    def emit(kind, **payload):
        event = {"id": len(events) + 1, "type": kind, **payload}
        events.append(event)
        apply_event(state, event)

    def runtime(kind, **payload):
        emit("runtime", event={"type": kind, **payload})

    def handoff(sender, recipient, seq, **bindings):
        envelope = {"from": sender, "to": recipient, "channel": "work", "seq": seq}
        runtime("send", **envelope, bindings=bindings)
        runtime("recv", **envelope, bindings=bindings)

    emit("room.started")
    handoff("Human", "Reviewer", 1, task="One shared task")
    for round_number in [1, 2]:
        runtime("act_start", action_kind="assistant", lifeline="Implementer", action="implement")
        handoff(
            "Implementer",
            "Reviewer",
            round_number,
            proposal="Corrected unclear wording.\n\nMore detail.",
        )
        runtime("act_start", action_kind="assistant", lifeline="Reviewer", action="review")
        emit("assistant.invocation", role="Reviewer", invocation_id=f"review-{round_number}")
        for text in ["Reading notes.tex…", "Inspecting repository files…"] * 4:
            emit(
                "assistant.progress",
                role="Reviewer",
                invocation_id=f"review-{round_number}",
                activity={"text": text},
            )
        review = "REVISE\nFINDINGS: 2\nTwo changes alter the original meaning.\n\n"
        review += (
            "## Findings\n\n1. **Restore meaning** in `notes.tex`.\n2. Preserve the conclusion.\n\n"
        )
        review += '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>\n\n'
        review += "[unsafe](javascript:alert(1)) [local](/api/rooms)\n\nA&#x20;paragraph."
        runtime(
            "act",
            action_kind="assistant",
            lifeline="Reviewer",
            action="review",
            inputs={"task": "One shared task"},
            outputs={"critique": review},
        )
        handoff("Reviewer", "Human", round_number, critique=review)
    emit("room.completed", outcome="Stopped after review")
    return state, events


def test_round_conversation_markdown_and_quiet_activity(service, config):
    _, base, _ = service
    state, events = journal_fixture(config)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.route(f"**/api/runs/{state['id']}", lambda route: route.fulfill(json=state))
        page.route(
            f"**/api/runs/{state['id']}/trace",
            lambda route: route.fulfill(
                body="\n".join(json.dumps(event) for event in events),
                content_type="application/x-ndjson",
            ),
        )
        page.route(
            f"**/api/rooms/{state['id']}/context",
            lambda route: route.fulfill(
                json={
                    "id": state["id"],
                    "name": "Example review",
                    "config": config,
                    "brief": config["task"],
                    "runs": [state["id"]],
                }
            ),
        )
        page.goto(base + "/#room=" + state["id"])
        expect(page.locator("#room-status")).to_have_text("Completed")
        page.locator("#actor-Reviewer").click()
        expect(page.locator("#participant-info")).to_contain_text("Completed review")
        expect(page.locator("#participant-info")).to_contain_text("REVISE · 2 findings")
        expect(page.locator("#participant-info")).to_contain_text("Round 2 of 4")
        expect(page.locator("#participant-info")).to_contain_text("Claude CLI · Read-only access")
        assert str(config["workspace"]) not in page.locator("#participant-info").inner_text()
        rounds = page.locator("#transcript .conversation-round")
        assert rounds.count() == 3  # Initial brief and two rounds; task never copied from turns.
        latest = page.locator('#transcript [data-round="2"]')
        expect(latest).to_have_attribute("open", "")
        expect(page.locator('#transcript [data-round="1"]')).not_to_have_attribute("open", "")
        expect(latest).to_contain_text("Received from Implementer")
        expect(latest).to_contain_text("Sent to Human")
        assert page.locator("#transcript .message-card").count() == 5
        assert page.locator("#transcript .full-payload").count() == 0
        assert "One shared task" not in page.locator("#transcript").inner_text()
        latest.get_by_text("View full review", exact=True).click()
        expect(latest.locator(".message-prose h2")).to_have_text("Findings")
        expect(latest.locator(".message-prose strong")).to_have_text("Restore meaning")
        expect(latest.locator(".message-prose code")).to_have_text("notes.tex")
        expect(latest.locator(".message-prose")).to_contain_text("A paragraph.")
        assert (
            latest.locator(
                ".message-prose img, .message-prose script, .message-prose a[href]"
            ).count()
            == 0
        )
        assert page.evaluate("window.pwned") is None
        page.get_by_text("Show activity log", exact=True).click()
        assert page.locator("#participant-details .activity-log li").count() == 2
        page.get_by_text("Technical details", exact=True).click()
        expect(page.locator("#participant-details")).to_contain_text("reviewer-agent-claude")
        expect(page.locator("#participant-details")).to_contain_text("CLI default model")
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors
        browser.close()


def test_projection_and_live_inspector_stability(service, config):
    _, base, _ = service
    state, events = journal_fixture(config)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base)
        result = page.evaluate(
            """async ({events, state}) => {
            const mod = await import('/inspector.js');
            const pair = [
                {id:1,type:'runtime',event:{type:'recv',from:'A',to:'B',channel:'c',seq:7,bindings:{incoming:'hello'}}},
                {id:2,type:'runtime',event:{type:'send',from:'A',to:'B',channel:'c',seq:7,bindings:{proposal:'hello'}}},
            ];
            const messages = mod.conversation(pair);
            const host = document.createElement('div'); document.body.append(host);
            const overview = document.createElement('div');
            const conversation = document.createElement('div');
            const technical = document.createElement('div');
            host.append(overview, conversation, technical);
            const role = {name:'Reviewer',kind:'agent',access:'Read-only access'};
            const args = {state, events, role, overview, conversation, technical};
            mod.renderParticipant(args);
            const round = conversation.querySelector('[data-round="1"]'); round.open = true;
            const summary = round.querySelector('summary'); summary.focus();
            const before = summary;
            state.local_activity.Reviewer = {text:'Reading notes.tex…'};
            state.participants.Reviewer = 'reviewing';
            mod.renderParticipant(args);
            const stable = before === conversation.querySelector('[data-round="1"] summary')
                && document.activeElement === before && round.open;
            state.round = 3;
            mod.renderParticipant(args);
            const collapsed = !conversation.querySelector('[data-round="1"]').open;
            host.remove();
            return {messages, stable, collapsed};
        }""",
            {"state": state, "events": events},
        )
        assert result["stable"] and result["collapsed"]
        assert len(result["messages"]) == 1
        message = result["messages"][0]
        assert message["send_id"] == 2 and message["receive_id"] == 1
        assert message["label"] == "Proposal" and message["bindings"] == {"proposal": "hello"}
        browser.close()
