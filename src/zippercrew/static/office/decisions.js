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
    const host=node('div','','decision');$('detail-body').append(host);this.render(host,false);
  }
  update(){
    if(this.session.mode!=='decision')return;
    if(!this.pending){$('detail-dialog').close();return;}
    this.render($('detail-body').querySelector('.decision'),false);
  }
  humanCard(){
    const host=$('human-decision'),visible=this.session.scene.selected==='human'&&!!this.pending;
    host.hidden=!visible;$('person-card').dataset.decision=String(visible);
    $('person-activity').parentElement.hidden=visible;$('agent-controls').hidden=visible;
    $('person-task').querySelector('.field-label').textContent=this.session.scene.selected==='human'?'Current task':'Current focus';
    if(visible)this.render(host,true);else{host.replaceChildren();delete host.dataset.key;}
  }
  render(host,compact){
    if(!host||!this.pending)return;
    const s=this.session,run=s.taskRun,pending=this.pending,summary=this.summary();
    const key=JSON.stringify([run.id,pending.id,s.connected,summary]);if(host.dataset.key===key)return;
    host.dataset.key=key;host.replaceChildren();
    const select=pending.spec.kind==='select',choices=(pending.spec.rendered?.prefill||'').split('\n').filter(Boolean);
    const recommended=choices.includes(summary.recommendation)?summary.recommendation:null;
    if(compact)host.append(node('p','Decision required','decision-eyebrow'));
    const title=recommended?`Reviewer recommends: ${recommended}`:run.config.workflow==='direct'?'The Worker’s result is ready':'Review needs your decision';
    host.append(node('h3',select?title:'Add any final guidance','decision-recommendation'));
    if(summary.reason)host.append(node('p',summary.reason,'decision-reason'));
    if(!s.connected)host.append(node('p','Reconnecting. Your decision will be available when the room is connected.','field-help'));
    const actions=node('div','','decision-actions');
    const noteKey=`${run.id}:${pending.id}`,savedNote=s.guidanceDrafts.get(noteKey)||'';
    const limit=run.round>=run.config.max_rounds;
    if(select){
      // Put the recommendation first; the other choices remain equally accessible.
      const ordered=recommended?[recommended,...choices.filter(v=>v!==recommended)]:choices;
      for(const choice of ordered){
        const action=button(choice,()=>s.answer(pending.id,choice,{note:s.guidanceDrafts.get(noteKey)||'',noteKey,errorHost:compact?host:null}),choice===(recommended||'Done'));
        action.disabled=!s.connected||(choice==='Another round'&&limit);actions.append(action);
      }
      host.append(actions);
      if(limit&&choices.includes('Another round'))host.append(node('p','The round limit is reached. Finish or abandon this run.','field-help'));
    }
    if(!select||(choices.includes('Another round')&&!limit)){
      const details=node('details','','decision-note');details.open=!!savedNote;
      details.append(node('summary','Add a note for the Worker'));
      const note=input(compact?'human-decision-note':'decision-note',savedNote,true);note.rows=3;note.maxLength=30000;note.disabled=!s.connected;
      note.placeholder='What would you like the Worker to focus on?';
      note.oninput=()=>s.guidanceDrafts.set(noteKey,note.value);
      details.append(field('Optional note',note),node('p',run.config.workflow==='direct'?'Optional. Add emphasis, corrections, or extra instructions.':'Optional. Add emphasis, corrections, or extra instructions. The reviewer feedback is already included automatically.','field-help'));
      host.append(details);
      // Compatibility for a pre-upgrade run already waiting at ask_note.
      if(!select){const go=button('Run next round',()=>s.answer(pending.id,note.value,{noteKey}),true);go.disabled=!s.connected;host.append(go);}
    }
    if(compact){
      const more=button('Review & decide →',()=>this.open());more.className='review-decision';host.append(more);return;
    }
    if(summary.task_issue){
      const edit=button('Edit task before rerunning',()=>this.editTask(pending.id));edit.className='edit-decision-task';edit.disabled=!s.connected;
      host.append(edit,node('p','Ends this run and opens the whiteboard. Its review stays in History.','field-help'));
    }
    const why=node('details','','decision-disclosure');why.append(node('summary','Why?'));
    const worker=node('section');worker.append(node('h4','Worker'),node('p',summary.worker||withoutSummary(report(run,'Implementer'))||'No worker summary was returned.','decision-evidence'));why.append(worker);
    const critique=withoutSummary(report(run,'Reviewer'));
    if(critique){
      const review=node('section'),count=summary.findings!=null&&String(summary.findings)!=='?'?` · ${summary.findings} finding${String(summary.findings)==='1'?'':'s'}`:'';
      review.append(node('h4',`Reviewer${count}`));
      const lines=critique.split('\n'),body=/^(APPROVE|REVISE)$/i.test(lines[0].trim())?lines.slice(3).join('\n').trim():critique;
      // The complete findings remain here. Raw invocation output is kept below.
      review.append(node('p',body||summary.reason,'decision-evidence'));why.append(review);
    }else if(!summary.worker)why.append(node('p',withoutSummary(pending.spec.rendered?.context),'decision-evidence'));
    host.append(why);
    const technical=node('details','','decision-disclosure'),content=node('div');technical.append(node('summary','Technical details'),content);
    let loaded=false;technical.ontoggle=()=>{
      if(!technical.open||loaded)return;loaded=true;
      content.append(node('p',run.config.workspace,'repository-path'));
      const progress=node('div'),reports=node('div'),tools=node('div');
      s.scene.activity.renderRecent(progress,null,12,run);s.renderReports(reports,run);s.renderToolLog(tools,run);
      const stop=button('Stop run',()=>s.stopRun());stop.disabled=!s.connected;
      content.append(progress,reports,tools,stop);
    };
    host.append(technical);
  }
  editTask(requestId){
    const s=this.session;s.perform(async()=>{
      const state=await api(`/api/runs/${s.run.id}/stop`,{request_id:requestId});
      // Replace this same sheet with the whiteboard; no intermediary confirmation.
      s.mode=null;s.apply(state);s.stream?.close();s.stream=null;s.connected=true;
      s.configuration.editTask();
    });
  }
}
