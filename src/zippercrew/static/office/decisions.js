import {api,node,button,field,input,terminal} from './session.js';

const $=id=>document.getElementById(id);
const withoutSummary=text=>String(text||'').replace(/<decision-summary>[\s\S]*?<\/decision-summary>/g,'').trim();
const report=(run,role)=>Object.values((run.transcript||[]).findLast(entry=>entry.role===role&&entry.round===run.round)?.outputs||{}).join('\n\n');
const concise=text=>String(text||'').replace(/[*_`#]/g,'').replace(/\s+/g,' ').trim().slice(0,280);

export class OfficeDecisions {
  constructor(session){this.session=session;}
  get pending(){
    const run=this.session.taskRun,bridge=this.session.decisionContinuation;
    if(bridge&&run&&bridge.id===run.id&&bridge.round===run.round&&run.pending?.action==='ask_note')return null;
    return run&&!terminal(run)?run.pending:null;
  }
  summary(){
    const run=this.session.taskRun,pending=this.pending;
    if(pending.summary)return pending.summary;
    // Existing runs keep working after an upgrade; use their real review header.
    const worker=withoutSummary(report(run,'Implementer')).split('\n').find(line=>line.trim()&&!line.startsWith('#'))||'';
    return {recommendation:run.review?.verdict==='APPROVE'?'Ship it':run.review?.verdict==='REVISE'?'Another round':null,
      reason:concise(run.review?.headline||worker),worker:concise(worker),findings:run.review?.findings,task_issue:false};
  }
  open(){
    if(!this.pending){this.session.showTask();return;}
    const s=this.session;s.window('decision',`Round ${s.taskRun.round||1}`,'Your decision');
    const host=node('div','','decision');$('detail-body').append(host);this.render(host);
  }
  update(){
    if(this.session.mode!=='decision')return;
    if(!this.pending){$('detail-dialog').close();return;}
    this.render($('detail-body').querySelector('.decision'));
  }
  render(host){
    if(!host||!this.pending)return;
    const s=this.session,run=s.taskRun,pending=this.pending,summary=this.summary();
    const key=JSON.stringify([run.id,pending.id,s.connected,summary]);if(host.dataset.key===key)return;
    host.dataset.key=key;host.replaceChildren();
    const select=pending.spec.kind==='select',choices=(pending.spec.rendered?.prefill||'').split('\n').filter(Boolean);
    const recommended=choices.includes(summary.recommendation)?summary.recommendation:null;
    const title=recommended?`Reviewer recommends ${recommended.toLowerCase()}`:run.config.workflow==='direct'?'The Worker’s result is ready':'Review needs your decision';
    host.append(node('h3',select?title:'Add any final guidance','decision-recommendation'));
    if(summary.reason)host.append(node('p',summary.reason,'decision-reason'));
    if(!s.connected)host.append(node('p','Reconnecting. Your decision will be available when the room is connected.','field-help'));
    const actions=node('div','','decision-actions');
    const noteKey=`${run.id}:${pending.id}`,savedNote=s.guidanceDrafts.get(noteKey)||'';
    const limit=run.round>=run.config.max_rounds;
    if(select){
      const primary=recommended||(choices.includes('Done')?'Done':choices.includes('Ship it')?'Ship it':choices[0]);
      const label=choice=>choice==='Another round'?'Run next round':choice;
      const makeAction=(choice,main=false)=>{
        const action=button(label(choice),()=>s.answer(pending.id,choice,{note:s.guidanceDrafts.get(noteKey)||'',noteKey}),main);
        action.disabled=!s.connected||(choice==='Another round'&&limit);return action;
      };
      actions.append(makeAction(primary,true));host.append(actions);
      const alternatives=node('details','','decision-alternatives');alternatives.append(node('summary','Other choices'));
      const options=node('div','','decision-actions');
      for(const choice of choices.filter(choice=>choice!==primary))options.append(makeAction(choice));
      alternatives.append(options);host.append(alternatives);
      if(limit&&choices.includes('Another round'))host.append(node('p','The round limit is reached. Finish or abandon this run.','field-help'));
    }
    if(!select||(choices.includes('Another round')&&!limit)){
      const details=node('details','','decision-note');details.open=!!savedNote;
      details.append(node('summary','Add a note for the Worker'));
      const note=input('decision-note',savedNote,true);note.rows=3;note.maxLength=30000;note.disabled=!s.connected;
      note.placeholder='What would you like the Worker to focus on?';
      note.oninput=()=>s.guidanceDrafts.set(noteKey,note.value);
      details.append(field('Optional note',note),node('p',run.config.workflow==='direct'?'Optional. Add emphasis, corrections, or extra instructions.':'Optional. The reviewer feedback will already be passed to the Worker automatically.','field-help'));
      host.append(details);
      // Compatibility for a pre-upgrade run already waiting at ask_note.
      if(!select){const go=button('Run next round',()=>s.answer(pending.id,note.value,{noteKey}),true);go.disabled=!s.connected;host.append(go);}
    }
    if(summary.task_issue){
      const edit=button('Edit task before rerunning',()=>this.editTask(pending.id));edit.className='edit-decision-task';edit.disabled=!s.connected;
      host.append(edit,node('p','Clarify the task before starting a fresh run.','field-help'));
    }
    const why=node('details','','decision-disclosure');why.append(node('summary',recommended==='Another round'?'Why another round?':recommended==='Ship it'?'Why ship it?':'Why is a decision required?'));
    const worker=node('section');worker.append(node('h4','Worker'),node('p',summary.worker||withoutSummary(report(run,'Implementer'))||'No worker summary was returned.','decision-evidence'));why.append(worker);
    if(run.config.workflow!=='direct'){
      const review=node('section');review.append(node('h4','Reviewer rationale'),node('p',summary.reason||'No concise rationale was returned. Full findings are in Technical details.','decision-evidence'));why.append(review);
    }
    host.append(why);
    const technical=node('details','','decision-disclosure'),content=node('div');technical.append(node('summary','Technical details'),content);
    let loaded=false;technical.ontoggle=()=>{
      if(!technical.open||loaded)return;loaded=true;
      content.append(node('p',run.config.workspace,'repository-path'));
      const progress=node('div'),reports=node('div'),tools=node('div');
      s.scene.activity.renderRecent(progress,null,12,run);s.renderReports(reports,run);s.renderToolLog(tools,run);
      content.append(progress,reports,tools);
    };
    host.append(technical);
  }
  editTask(requestId){
    const s=this.session,run=s.run,room=s.room,key=`task:${run.id}:${requestId}`;
    s.window('decision-task-edit',`Round ${run.round} / Task`,'Clarify the task');
    const form=node('form','','room-form'),task=input('decision-task',s.guidanceDrafts.get(key)??room.brief,true);task.rows=6;task.maxLength=30000;task.required=true;
    task.oninput=()=>s.guidanceDrafts.set(key,task.value);
    const back=button('Back to decision',()=>this.open());
    const save=button('Save task and start new run',null,true);save.type='submit';
    const actions=node('div','','form-actions');actions.append(save,back);
    form.append(field('Task',task),node('p','Saving ends this run and starts a fresh run with the revised task. Existing edits and the review remain in History. Going back keeps your pending decision.','field-help'),actions);
    form.onsubmit=event=>{event.preventDefault();s.perform(async()=>{
      // Editing alone never consumes the pending decision. Only this explicit
      // restart replaces the immutable execution snapshot.
      if(s.run.id!==run.id)throw Error('The active room has changed.');
      if(!terminal(s.run)){
        const state=await api(`/api/runs/${run.id}/stop`,{request_id:requestId});s.apply(state);
        s.stream?.close();s.stream=null;s.connected=true;
      }
      await s.configuration.save({brief:task.value});
      s.guidanceDrafts.delete(key);
      await s.configuration.launch();
    });};
    $('detail-body').append(form);task.focus();
  }
}
