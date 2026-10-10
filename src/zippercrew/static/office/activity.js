// Public backend progress only. Abstract screen marks represent activity, never
// fabricated commands, output, percentages, or inferred private reasoning.
export const ROLES={worker:'Implementer',reviewer:'Reviewer',planner:'Critic',human:'Human'};
const active=run=>run&&!['completed','stopped','failed','paused'].includes(run.status);
// Copy is a deliberate room-facing description, not a clipped command/output.
export function activityCopy(event){
  if(event.source==='assistant.ui_status'||['review_delivery','review_critical','respond_delivery','respond_critical'].includes(event.action))return event.text;
  if(event.kind==='file'||/^Read(?:ing)? /.test(event.text||''))return event.text;
  const descriptions={
    tests:['Running the test suite.','Waiting for the test results.'],
    diff:['Inspecting the current diff.','Checking the proposed changes.'],
    format:['Checking code formatting.','Looking for formatting errors.'],
    lint:['Running code quality checks.','Looking for lint errors.'],
    types:['Checking the type signatures.','Waiting for the type checker.'],
    build:['Building the project.','Waiting for the build result.'],
    files:['Inspecting repository files.'],
  };
  if(!descriptions[event.category])return null;
  if(event.phase==='completed')return [event.text,event.detail].filter(Boolean).join('\n');
  return descriptions[event.category].join('\n');
}
export class OfficeActivity {
  constructor(scene){this.scene=scene;this.reset();}
  reset(){this.runId=null;this.seen=new Map();this.pending=new Map();this.nextSpeech=0;this.spoken=new Map();}
  isWorking(p){
    const session=this.scene.session;
    const run=session?.taskRun;
    return !!(session?.connected&&active(run)&&['working','reviewing'].includes(run.participants[ROLES[p.id]])&&
      (run.status!=='pausing'||Object.values(run.active_calls||{}).some(call=>call.role===ROLES[p.id])));
  }
  current(p){return this.isWorking(p)?this.scene.session.taskRun.local_activity?.[ROLES[p.id]]:null;}
  currentText(p){
    if(!this.scene.session?.connected&&active(this.scene.session?.taskRun))return 'Reconnecting…';
    const event=this.isWorking(p)?this.scene.session.taskRun.room_status?.[ROLES[p.id]]||this.current(p):null;
    return event?[event.text,event.detail].filter(Boolean).join(' · '):null;
  }
  observe(run,{replay=false}={}){
    if(this.runId!==run.id){this.reset();this.runId=run.id;}
    for(const [id,role] of Object.entries(ROLES)){
      const status=run.room_status?.[role],tool=run.local_activity?.[role];
      const event=status||tool;
      if(!event){this.pending.delete(id);continue;}
      const key=`${event.source}:${event.id}`;
      if(this.seen.get(id)===key)continue;
      this.seen.set(id,key);
      const text=activityCopy(event);
      if(!replay&&text&&text!==this.spoken.get(id))this.pending.set(id,{text,at:this.scene.worldTime});
    }
    if(replay||!active(run))this.pending.clear();
    // Real work immediately takes precedence over all ambient choreography.
    if(this.scene.ambient.trip?.ids.some(id=>this.isWorking(this.scene.people.get(id))))this.scene.ambient.cancel();
  }
  update(){
    const scene=this.scene;
    for(const [id,item]of this.pending)if(scene.worldTime-item.at>15||!this.isWorking(scene.people.get(id)))this.pending.delete(id);
    if(scene.handoffs.active||scene.handoffs.queue.length||scene.worldTime<this.nextSpeech||scene.worldTime<(scene.reactionUntil||0))return;
    // A new useful status can replace an older work bubble after four seconds;
    // conversations and action acknowledgments retain their own display time.
    if([...scene.people.values()].some(p=>p.bubble&&p.bubbleKind!=='work'))return;
    const next=this.pending.entries().next().value;if(!next)return;
    const [id,{text}]=next;this.pending.delete(id);this.spoken.set(id,text);
    for(const p of scene.people.values())if(p.bubbleKind==='work'){p.bubble?.destroy();p.bubble=null;}
    const readingTime=Math.max(6,Math.min(12,3+text.length/22));
    scene.say(id,text,readingTime,'work');this.nextSpeech=scene.worldTime+4;
  }

  react(id,text){
    const s=this.scene,p=s.people.get(id);if(!p)return;
    s.ambient.cancel();s.handoffs.cancel();
    for(const person of s.people.values()){person.bubble?.destroy();person.bubble=null;}
    s.reactionUntil=s.worldTime+3.5;p.reactionUntil=s.reactionUntil;
    s.say(id,text,3.5,'conversation');
  }

  renderRecent(container,id,limit=3,run=this.scene.session?.taskRun){
    if(!container)return;
    const role=ROLES[id],entries=(run?.progress||[]).filter(e=>!role||e.role===role).slice(-limit).reverse();
    const key=JSON.stringify([run?.id,id,entries]);if(container.dataset.key===key)return;
    container.dataset.key=key;container.replaceChildren();
    if(!entries.length){
      if(limit>3){const p=document.createElement('p');p.className='field-help';p.textContent=active(run)?'Tool activity appears here when the CLI reports it. Full responses appear below.':'No tool activity recorded.';container.append(p);}
      return;
    }
    const heading=document.createElement('p');heading.className='field-label';heading.textContent='Recent activity';container.append(heading);
    const list=document.createElement('ol');list.className='tool-activity';
    for(const event of entries){
      const li=document.createElement('li');li.dataset.phase=event.phase;
      const text=document.createElement('span');text.textContent=event.text;li.append(text);
      if(event.detail){const detail=document.createElement('small');detail.textContent=event.detail;li.append(detail);}
      if(!role){const who=document.createElement('small');who.textContent=`${event.role==='Implementer'?'Worker':event.role} · round ${event.round||1}`;li.append(who);}
      list.append(li);
    }
    container.append(list);
  }
}
