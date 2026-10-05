from __future__ import annotations

import os
import re
import tomllib
from pathlib import Path

import pytest
from playwright.sync_api import expect, sync_playwright

pytestmark = pytest.mark.browser


def inspect_scene(page):
    return page.evaluate("async () => (await import('/scene.js')).inspectScene()")


def screenshot(page, name):
    if os.environ.get("ZIPPERCREW_SCREENSHOTS"):
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "true")
        # Finish the inspector's CSS resize and give Canvas a frame to repaint.
        page.evaluate("""async () => {
            await Promise.all(document.getAnimations().map(a => a.finished.catch(() => {})));
            await new Promise(resolve =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }""")
        target = Path(os.environ["ZIPPERCREW_SCREENSHOTS"])
        target.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(target / f"{name}.png"), full_page=True)


def configure(page, project, mode="brief"):
    for role in ("Implementer", "Reviewer"):
        page.locator(f"#actor-{role}").click()
        page.get_by_label("Assistant profile", exact=True).select_option("Scripted demo")
    page.locator("#actor-Human").click()
    page.get_by_label("Your involvement").select_option(mode)
    page.get_by_label("Maximum rounds").fill("3")
    page.get_by_role("button", name="Close inspector").click()
    page.locator("#project-board").click()
    page.get_by_label("Working repository").fill(str(project))
    page.get_by_label("The task", exact=True).fill(
        "Fix the rounding error and add a regression test."
    )
    page.get_by_role("button", name="Done", exact=True).click()
    expect(page.locator("#room-status")).to_have_text("Ready")


def test_continuous_room_through_two_rounds_and_history(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        expect(page.locator("#room-art")).to_be_visible()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("empty"))
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("empty"))
        expect(page.locator("#actor-Human")).to_have_class(re.compile("bound"))
        expect(page.locator("#start")).to_be_disabled()
        assert page.get_by_text("Open the room", exact=False).count() == 0
        screenshot(page, "first-frame")
        configure(page, project)
        screenshot(page, "ready")
        reviewer_seat = page.locator("#actor-Reviewer").get_attribute("data-x")
        scene = page.locator("#room-art canvas").element_handle()
        page.get_by_role("button", name="Start working").click()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("working"))
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("waiting"))
        expect(page.locator("#actor-Implementer")).to_have_attribute("data-pose", "typing")
        expect(page.locator("#actor-Reviewer")).to_have_attribute("data-pose", "coffee")
        assert page.locator("#actor-Reviewer").get_attribute("data-x") != reviewer_seat
        screenshot(page, "implementing")
        assert scene.evaluate("node => node === document.querySelector('#room-art canvas')")
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("reviewing"))
        expect(page.locator("#actor-Reviewer")).to_have_attribute("data-pose", "reading")
        assert inspect_scene(page)["participants"][1]["frame"] == "work"
        screenshot(page, "reviewing")
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible(
            timeout=15000
        )
        expect(page.locator("#actor-Human")).to_have_class(re.compile("needs-human"))
        assert inspect_scene(page)["messages"]
        screenshot(page, "human-turn")
        page.reload()
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible()
        # Historical messages do not pretend to be new transfers on reconnect.
        assert not inspect_scene(page)["messages"]
        page.get_by_role("button", name="Another round", exact=True).click()
        page.get_by_label("Guidance for the Implementer").fill("Check zero as well.")
        page.get_by_role("button", name="Continue the conversation").click()
        expect(page.locator("#round-label")).to_have_text("ROUND 2 / 3", timeout=15000)
        expect(page.get_by_role("button", name="Ship it", exact=True)).to_be_visible(timeout=15000)
        page.locator("#actor-Implementer").click()
        previous_round = page.locator('#transcript .conversation-round[data-round="1"]')
        previous_round.locator("summary").first.click()
        previous_round.get_by_text("View full guidance", exact=True).click()
        expect(page.locator("#transcript")).to_contain_text("Check zero as well.")
        expect(page.locator("#role-access")).to_have_text("Write access")
        screenshot(page, "inspector")
        page.locator("#human-return").click()
        page.get_by_role("button", name="Ship it", exact=True).click()
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)", timeout=15000)
        expect(page.locator("#room-status")).to_have_text("Completed")
        assert page.locator("#trace-link").get_attribute("href").endswith("/trace")
        page.get_by_role("button", name="Close inspector").click()
        page.wait_for_function("""async () => {
            const view = (await import('/scene.js')).inspectScene().viewport;
            const width = document.getElementById('phaser-host').clientWidth;
            return view.width === width && view.cameraWidth === width;
        }""")
        screenshot(page, "completed")
        page.get_by_role("button", name="New room").click()
        page.get_by_role("button", name="Rooms", exact=True).click()
        page.locator(".history-item").first.click()
        expect(page.locator("#room-status")).to_have_text("Completed")
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)")
        page.set_viewport_size({"width": 390, "height": 844})
        page.locator("#actor-Reviewer").click()
        expect(page.locator("#role-access")).to_have_text("Read-only access")
        screenshot(page, "mobile")
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        assert not errors
        browser.close()


def test_profile_creation_with_model_pins_from_empty_station(service):
    app, base, project = service
    app.demo = False  # Use real profile storage; this test never launches an assistant.
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(base)
        expect(page.locator("#room-art")).to_be_visible()
        screenshot(page, "first-frame-real")
        page.locator("#actor-Implementer").focus()
        page.keyboard.press("Enter")
        page.get_by_role("button", name="Create a profile").click()
        page.get_by_label("Profile name", exact=True).fill("precise-implementer")
        page.get_by_label("Model", exact=False).fill("model-for-implementation")
        page.get_by_label("Reasoning effort", exact=False).fill("high")
        page.get_by_role("button", name="Save profile").click()
        expect(page.locator("#actor-Implementer")).to_have_class(re.compile("bound"))
        expect(page.locator("#role-profile")).to_have_value("precise-implementer")
        expect(page.locator("#profile-summary")).to_contain_text(
            "model-for-implementation · high effort"
        )
        page.locator("#actor-Reviewer").click()
        expect(page.locator("#actor-Reviewer")).to_have_class(re.compile("empty"))
        page.get_by_label("Assistant profile", exact=True).select_option("precise-implementer")
        expect(page.locator("#role-access")).to_have_text("Read-only access")
        saved = tomllib.loads((project / "zippergen.toml").read_text())
        assert (
            saved["assistants"]["configurations"]["precise-implementer"]["reasoning_effort"]
            == "high"
        )
        expect(page.locator("#error")).to_be_hidden()
        browser.close()


@pytest.mark.parametrize("motion", ["reduce", "no-preference"])
def test_autonomous_review_same_room_and_motion_preference(service, motion):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1180, "height": 820}, reduced_motion=motion)
        page.goto(base)
        configure(page, project, "auto")
        page.evaluate("""() => {
            window.transfers = [];
            document.addEventListener('room-message', event => {
                if (!event.detail.replay) window.transfers.push(event.detail);
            });
        }""")
        scene = page.locator("#room-art canvas").element_handle()
        page.get_by_role("button", name="Start working").click()
        expect(page.locator("#outcome")).to_contain_text("Shipped after 2 round(s)", timeout=15000)
        expect(page.locator("#human-panel")).to_be_hidden()
        transfers = page.evaluate("window.transfers")
        assert any(t["from"] == "Implementer" and t["to"] == "Reviewer" for t in transfers)
        assert len({t["id"] for t in transfers}) == len(transfers)
        assert scene.evaluate("node => node === document.querySelector('#room-art canvas')")
        assert inspect_scene(page)["reducedMotion"] == (motion == "reduce")
        assert inspect_scene(page)["renderer"] == "Phaser.Canvas"
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        browser.close()


def test_stop_keeps_scene_and_result_accessible(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1366, "height": 768}, reduced_motion="reduce")
        page.goto(base)
        configure(page, project)
        scene = page.locator("#room-art canvas").element_handle()
        page.get_by_role("button", name="Start working").click()
        expect(page.locator("#actor-Implementer")).to_have_attribute("data-state", "working")
        page.get_by_role("button", name="Stop room", exact=True).click()
        expect(page.locator("#room-status")).to_have_text("Stopped")
        expect(page.locator("#actor-Implementer")).to_have_attribute("data-pose", "stopped")
        assert scene.evaluate("node => node === document.querySelector('#room-art canvas')")
        page.keyboard.press("Escape")
        expect(page.locator("#inspector")).to_be_hidden()
        page.get_by_role("button", name="Result", exact=False).click()
        expect(page.locator("#outcome-title")).to_have_text("Stopped")
        assert page.evaluate("document.documentElement.scrollHeight <= window.innerHeight")
        browser.close()


def test_canvas_selection_and_keyboard_inspector_coexist(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto(base)
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "true")
        # Click the illustrated Human's face above the DOM keyboard target.
        target = page.locator("#actor-Human").bounding_box()
        page.mouse.click(target["x"] + target["width"] / 2, target["y"] - 75)
        expect(page.locator("#inspector-title")).to_have_text("Human")
        page.get_by_label("Maximum rounds").fill("12")
        page.keyboard.press("Escape")
        expect(page.locator("#inspector")).to_be_hidden()
        expect(page.locator("#actor-Human")).to_be_focused()
        page.keyboard.press("Enter")
        expect(page.get_by_label("Maximum rounds")).to_have_value("12")
        browser.close()


def test_asset_failure_is_explicit_and_does_not_allow_start(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.route("**/assets/characters/reviewer.png", lambda route: route.abort())
        page.goto(base)
        expect(page.locator("#error")).to_contain_text("Room asset could not load")
        expect(page.locator(".scene-loading")).to_contain_text("Reload to retry")
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "false")
        expect(page.locator("#start")).to_be_disabled()
        browser.close()


def test_changing_rooms_cancels_in_flight_visuals(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(base)
        configure(page, project)
        page.locator("#start").click()
        page.wait_for_function("""async () => {
            const state = (await import('/scene.js')).inspectScene();
            return state.messages.length > 0;
        }""")
        page.get_by_role("button", name="New room").click()
        # Let the old transfer's complete/fade callbacks pass their former deadline.
        page.wait_for_timeout(2400)
        assert not inspect_scene(page)["messages"]
        page.emulate_media(reduced_motion="reduce")
        page.wait_for_function(
            "async () => (await import('/scene.js')).inspectScene().reducedMotion"
        )
        assert not any(p["moving"] for p in inspect_scene(page)["participants"])
        assert not errors
        browser.close()


def test_cosmetic_policy_is_calm_interruptible_and_observable(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page()
        page.goto(base)
        result = page.evaluate("""async () => {
            const { AmbientDirector, ActivityCadence } = await import('/presentation.js');
            const check = (condition, message) => { if (!condition) throw Error(message); };
            let rolls = [];
            const d = new AmbientDirector(() => rolls.shift() ?? 0.99);
            check(d.step('Implementer', 'waiting', 0) === null, 'initial pause');
            rolls = [0, 0.9, 0.4, 0]; // cadence, do action, coffee, duration
            check(d.step('Implementer', 'waiting', 60000) === 'coffee', 'coffee');
            check(d.reservations.get('back-aisle') === 'Implementer', 'reserve shared aisle');
            d.step('Reviewer', 'waiting', 0);
            rolls = [0, 0.9, 0.4];
            check(d.step('Reviewer', 'waiting', 60000) === null, 'no shared collision');
            check(d.step('Implementer', 'working', 60001) === null, 'work preempts');
            check(d.reservations.size === 0, 'release reservation');
            for (const state of ['working', 'reviewing', 'needs human',
                                'failed', 'stopped', 'unconfigured'])
                check(d.step('Human', state, 1000000) === null, 'forbidden ambient state');
            check(d.step('Reviewer', 'waiting', 2000000, true) === null, 'reduced motion');
            const calm = new AmbientDirector(() => 0.2);
            let actions = 0;
            for (let t = 0; t < 3600000; t += 1000) if (calm.step('Human', 'waiting', t)) actions++;
            check(actions === 0, 'doing nothing remains possible indefinitely');
            const a = new ActivityCadence();
            const first = { id: 1, text: 'Working on the task…' };
            const next = { id: 2, text: 'Reviewing the proposal…' };
            check(a.step('Implementer', 'working', first, 0).id === 1, 'observed activity');
            check(a.step('Implementer', 'working', next, 100).id === 1, 'rate limiting');
            check(a.step('Implementer', 'working', next, 4500).id === 2, 'latest useful event');
            check(a.step('Implementer', 'working', next, 12000) === null,
                  'expires without invention');
            check(a.step('Implementer', 'working', {...next, id:3}, 12500) === null,
                  'repeated output stays suppressed after expiry');
            check(a.step('Implementer', 'waiting', first, 13000) === null, 'no waiting bubbles');
            check(a.step('Human', 'working', next, 14000) === null, 'no human invention');
            check(a.step('Reviewer', 'reviewing', next, 0, true) === null, 'no history replay');
            return true;
        }""")
        assert result
        browser.close()


def test_scene_preempts_ambient_and_does_not_invent_message_receipts(service):
    _, base, _ = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(base)
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "true")
        # Component harness uses the production renderer, with explicit semantic
        # inputs and an injected random source. It never mutates a real process.
        page.evaluate("""async () => {
            const { launchRoom } = await import('/room-engine.js');
            const host = document.createElement('div');
            host.style.cssText = 'position:fixed;inset:0;z-index:9000';
            document.body.append(host);
            await new Promise(resolve => launchRoom(host, { onReady(scene) {
                window.roomTest = scene;
                window.viewTest = {
                    states: { Implementer:'waiting', Reviewer:'waiting', Human:'waiting' },
                    bindings: { Implementer:{profile:'test'}, Reviewer:{profile:'test'} },
                    activities: {}, task:'Test presentation priorities' };
                scene.setReducedMotion(true);
                scene.present(window.viewTest);
                scene.setReducedMotion(false);
                resolve();
            }}));
        }""")
        page.evaluate("""() => {
            const s = window.roomTest;
            s.ambient.random = () => 0.99;
            s.ambient.step('Reviewer', 'waiting', s.time.now);
            const p = s.ambient.people.get('Reviewer');
            p.due = -1;
            let rolls = [0, .9, .4, 0];
            s.ambient.random = () => rolls.shift() ?? .99;
        }""")
        page.wait_for_function("() => roomTest.inspect().participants[1].ambientAction === 'board'")
        assert page.evaluate("roomTest.inspect().participants[1].state") == "waiting"
        page.evaluate("""() => {
            viewTest.states.Reviewer = 'reviewing';
            viewTest.activities.Reviewer = {id:1, text:'Reviewing the proposal…'};
            roomTest.present(viewTest);
        }""")
        assert page.evaluate("roomTest.inspect().participants[1].ambientAction") is None
        page.wait_for_function("() => roomTest.inspect().participants[1].currentActivity !== null")
        page.evaluate("""() => {
            window.envelopeTest = {id:'test-send', version:1, from:'Implementer', to:'Reviewer',
                send_id:5, receive_id:null, seq:12, channel:'work',
                label:'Proposal', status:'sent'};
            roomTest.message(envelopeTest);
        }""")
        page.wait_for_function("() => roomTest.inspect().envelopes[0]?.arrived")
        envelope = page.evaluate("roomTest.inspect().envelopes[0]")
        assert envelope["status"] == "sent" and envelope["receive_id"] is None
        page.evaluate("""() => {
            roomTest.message({...envelopeTest, version:2, receive_id:7, status:'received'});
        }""")
        assert page.evaluate("roomTest.inspect().envelopes[0].status") == "received"
        page.evaluate("""() => {
            viewTest.states.Human = 'needs human';
            roomTest.present(viewTest);
            roomTest.setReducedMotion(true);
        }""")
        people = page.evaluate("roomTest.inspect().participants")
        assert not any(p["ambientAction"] or p["moving"] for p in people)
        assert people[2]["frame"] == "receive"
        page.evaluate("roomTest.resetMessages()")
        assert page.evaluate("roomTest.inspect().messages") == []
        assert not errors
        browser.close()


def test_motion_setting_and_inspectable_protocol_history(service):
    _, base, project = service
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(base)
        configure(page, project)
        page.locator("#settings-control").click()
        page.get_by_label("Room animation", exact=True).select_option("reduced")
        assert inspect_scene(page)["reducedMotion"]
        page.get_by_role("button", name="Close inspector").click()
        page.locator("#start").click()
        expect(page.get_by_role("button", name="Another round", exact=True)).to_be_visible()
        page.locator("#activity-control").click()
        row = page.locator("#activity details").filter(has_text="Implementer → Reviewer · Proposal")
        row.locator("summary").click()
        expect(row).to_contain_text("Received by runtime")
        expect(row).to_contain_text("Demo proposal, round 1")
        expect(row).to_contain_text("Send event")
        page.reload()
        expect(page.locator("#room-art")).to_have_attribute("data-ready", "true")
        assert inspect_scene(page)["reducedMotion"]
        browser.close()
