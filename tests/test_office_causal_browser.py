"""The real scheduler consumes recorded traces under randomized merged updates."""

import pytest
from playwright.sync_api import sync_playwright
from test_causal_presentation import snapshots

pytestmark = pytest.mark.browser


@pytest.mark.parametrize("workflow", ["direct", "review", "double_review"])
def test_recorded_traces_under_random_snapshot_merges(service, config, workflow):
    _, base, _ = service
    states = list(snapshots(workflow, config))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        result = page.evaluate(
            """({states,workflow}) => {
          studio.game.loop.stop();studio.setWorkflow(workflow);
          const h=studio.handoffs,assert=(ok,text)=>{if(!ok)throw Error(text);};
          // Check every actual presentation transition, not only the final state.
          const original=h.complete.bind(h);
          h.complete=(step,mode)=>{
            assert(h.satisfied(step.after),'Presented before prerequisite: '+step.id);
            if(step.kind==='message')assert(h.receipts.get(step.id)?.receive_id,'Invented receipt');
            original(step,mode);
          };
          let seed=841;
          const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32;};
          for(let trial=0;trial<30;trial++){
            h.reset();
            // Last trial merges the entire run. Other trials merge random groups,
            // inject repeated snapshots and vary how many visual frames happen.
            for(let i=trial===29?states.length-1:0;i<states.length;){
              h.observe(states[i]);
              if(random()<.5)h.observe(states[i]);
              for(let frame=0;frame<Math.floor(random()*20);frame++)studio.update(0,1000/30);
              const next=Math.min(states.length-1,i+1+Math.floor(random()*9));
              if(next===i)break;i=next;
            }
            h.settle('test-catch-up');
            const expected=states.at(-1).messages.filter(m=>!m.control&&m.receive_id&&m.send_id);
            assert(h.completed.length===expected.length,'Lost or duplicate exchange');
            assert(expected.every(m=>h.completed.some(d=>d.id===m.id)),'Missing envelope');
            assert(new Set(h.presented.map(s=>s.id)).size===h.presented.length,'Duplicate step');
            assert(states.at(-1).presentation.every(s=>h.done.has(s.id)),'Lost work event');
            assert(!h.active&&!h.queue.length,'Unsettled courier');
          }
          return {messages:h.completed.length,steps:h.presented.length};
        }""",
            {"states": states, "workflow": workflow},
        )
        assert result["messages"] > 0 and result["steps"] > result["messages"]
        browser.close()


def test_pause_preserves_paper_and_human_messages_do_not_move_avatar(service):
    _, base, _ = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        page.evaluate("""() => {
          studio.game.loop.stop();const h=studio.handoffs;
          const assert=(ok,text)=>{if(!ok)throw Error(text);};
          const tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};
          const message={id:'a',from:'Implementer',to:'Reviewer',send_id:1,receive_id:2,
            label:'Proposal',after:[]};
          const state={id:'pause',status:'running',messages:[message],presentation:[]};
          h.observe(state);tick(1);const trip=h.active;
          assert(trip&&trip.phase==='walking','No departing courier');
          h.observe({...state,status:'paused'});
          assert(h.active===trip,'Pause canceled the courier');
          tick(600);
          assert(h.completed.some(m=>m.id==='a'),'Pause lost the paper');
          h.reset();studio.ambient.cancel();
          const human=studio.people.get('human'),x=human.x,y=human.y;
          h.observe({...state,id:'human-paper',messages:[{...message,id:'b',from:'Human',to:'Implementer'}]});
          tick(1);
          assert(h.active?.remote&&h.note.visible,'No paper from You');
          tick(90);
          assert(h.completed.some(m=>m.id==='b'),'Human message lost');
          assert(human.x===x&&human.y===y&&!human.route.length,'Human avatar moved');
        }""")
        browser.close()


def test_work_bubbles_and_typing_wait_for_their_incoming_message(service, config):
    _, base, _ = service
    state = next(
        s
        for s in snapshots("double_review", config)
        if s["local_activity"].get("Reviewer", {}).get("action") == "respond_delivery"
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        page.evaluate(
            """state => {
          studio.game.loop.stop();studio.setWorkflow('double_review');
          studio.session.stream?.close();studio.session.connected=true;
          const session=studio.session,h=studio.handoffs,p=studio.people.get('reviewer');
          session.room={...(session.room||{}),id:'room',
            brief:'A recorded task',config:state.config};
          state.config.room_id='room';session.run=state;
          h.observe(state);studio.activity.observe(state);
          if(studio.activity.isWorking(p))throw Error('Reviewing before delivery');
          if(studio.activity.currentText(p))throw Error('Future work description appeared');
          studio.activity.update();
          if(p.bubbleKind==='work'&&p.bubble)throw Error('Premature work bubble');
          const event=state.local_activity.Reviewer;
          h.settle();
          if(!h.satisfied(event.after))throw Error('Work prerequisites not settled');
          if(!studio.activity.isWorking(p))throw Error('No work posture after delivery');
          if(!studio.activity.currentText(p)?.includes('Comparing the two independent reviews'))
            throw Error('Missing real work status');
        }""",
            state,
        )
        browser.close()


def test_stopping_an_unreceived_send_never_invents_receipt_or_restarts_courier(service):
    _, base, _ = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        page.evaluate("""() => {
          studio.game.loop.stop();const h=studio.handoffs;
          const state={id:'interrupted-send',status:'running',messages:[{
            id:'unreceived',from:'Implementer',to:'Reviewer',send_id:1,receive_id:null,
            label:'Proposal',after:[],
          }]};
          h.observe(state);studio.update(0,1000/30);
          h.observe({...state,status:'stopped'});h.settle('stop');
          for(let i=0;i<900;i++)studio.update(0,1000/30);
          if(h.active||h.queue.length||h.note.visible)throw Error('Stopped courier restarted');
          if(h.done.has('unreceived')||h.completed.length)throw Error('Invented a receipt');
          if(h.receipts.get('unreceived')?.send_id!==1)throw Error('Lost the actual send');
        }""")
        browser.close()


@pytest.mark.parametrize("workflow", ["direct", "review", "double_review"])
def test_reduced_motion_shows_every_exchange_without_moving_people(service, config, workflow):
    _, base, _ = service
    states = [s for s in snapshots(workflow, config) if s["pending"]]
    state = states[0]
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(reduced_motion="reduce")
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        page.evaluate(
            """({state,workflow}) => {
          studio.game.loop.stop();studio.setWorkflow(workflow);studio.paused=true;
          const h=studio.handoffs,assert=(ok,text)=>{if(!ok)throw Error(text);};
          const positions=()=>JSON.stringify([...studio.people.values()].map(p=>[p.x,p.y]));
          const before=positions(),shown=[];const say=studio.say.bind(studio);
          studio.say=(id,text,...args)=>{shown.push({id,text});return say(id,text,...args);};
          const complete=h.complete.bind(h);
          h.complete=(step,mode)=>{
            assert(h.satisfied(step.after),'Receipt appeared out of order');
            if(step.kind==='message'&&!step.control){
              assert(mode==='static','Reduced motion silently skipped a message');
              assert(h.note.visible,'Missing static paper');
              assert(shown.at(-1)?.text.includes(' FROM '),'Missing static receipt bubble');
            }
            complete(step,mode);
          };
          h.observe(state);
          for(let i=0;i<2400;i++){
            if(i%30===0)h.observe(state);
            studio.update(0,1000/30);
            assert(positions()===before,'Reduced motion moved a character');
          }
          const expected=state.messages.filter(m=>!m.control&&m.receive_id&&m.send_id);
          assert(h.completed.length===expected.length,'Lost or repeated exchange');
          assert(shown.length===expected.length,'Missing or duplicate message bubbles');
          assert(!h.active&&!h.queue.length,'Reduced motion never settled');
        }""",
            {"state": state, "workflow": workflow},
        )
        browser.close()


def test_courier_waits_for_busy_recipient_then_walks_only_once(service):
    _, base, _ = service
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        page.evaluate("""() => {
          studio.game.loop.stop();studio.setWorkflow('double_review');
          const h=studio.handoffs,tick=n=>{for(let i=0;i<n;i++)studio.update(0,1000/30);};
          const message={id:'busy',from:'Reviewer',to:'Critic',send_id:1,receive_id:null,
            label:'Review',after:[]};
          const state={id:'busy-recipient',status:'running',messages:[message]};
          let starts=0;const start=h.start.bind(h);h.start=m=>{starts++;return start(m);};
          h.observe(state);tick(200);
          if(h.active||starts||h.completed.length)throw Error('Walked before recipient was ready');
          h.observe({...state,messages:[{...message,receive_id:2}]});
          for(let i=0;i<900;i++){
            h.observe({...state,messages:[{...message,receive_id:2}]});tick(1);
          }
          if(starts!==1||h.completed.length!==1)throw Error('Repeated or missing delivery');
        }""")
        browser.close()


def test_reduced_motion_preserves_real_status_event_until_its_receipts_arrive(service, config):
    from zippercrew.state import apply_event

    _, base, _ = service
    state = next(
        s
        for s in snapshots("double_review", config)
        if s["local_activity"].get("Reviewer", {}).get("action") == "respond_delivery"
    )
    version = state["version"]
    apply_event(
        state,
        {
            "id": version + 1,
            "type": "assistant.invocation",
            "role": "Reviewer",
            "invocation_id": "status-test",
        },
    )
    copy = "Comparing both reviews.\nChecking the reported regression against the test results."
    apply_event(
        state,
        {
            "id": version + 2,
            "type": "assistant.ui_status",
            "role": "Reviewer",
            "invocation_id": "status-test",
            "text": copy,
        },
    )
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(reduced_motion="reduce")
        page.goto(base + "/office/")
        page.wait_for_function(
            "() => studio.ready && studio.session.initialized && !studio.session.busy"
        )
        page.evaluate(
            """({state,copy}) => {
          studio.game.loop.stop();studio.setWorkflow('double_review');studio.paused=true;
          studio.session.stream?.close();studio.session.connected=true;
          studio.session.room={id:'status-room',brief:'Check reviews',config:state.config};
          state.config.room_id='status-room';studio.session.run=state;
          const h=studio.handoffs;let shown=0;const say=studio.say.bind(studio);
          studio.say=(id,text,...args)=>{
            if(text===copy){
              if(!h.satisfied(state.room_status.Reviewer.after))throw Error('Premature status');
              shown++;
            }
            return say(id,text,...args);
          };
          h.observe(state);studio.activity.observe(state);
          for(let i=0;i<900;i++)studio.update(0,1000/30);
          if(shown!==1)throw Error('Status lost or duplicated: '+shown);
        }""",
            {"state": state, "copy": copy},
        )
        browser.close()
