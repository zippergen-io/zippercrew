import {api,node,button,field,input,terminal,displayReport} from './session.js';

const $=id=>document.getElementById(id);
const withoutSummary=text=>displayReport(text);
const report=(run,role)=>Object.values((run.transcript||[]).findLast(entry=>entry.role===role&&entry.round===run.round)?.outputs||{}).join('\n\n');
const concise=text=>String(text||'').replace(/(?<![\w_`])_([^_\s](?:.*?[^_\s])??)_(?![\w_`])/g,'$1').replace(/[*`#]/g,'').replace(/\s+/g,' ').trim().slice(0,280);
const icon=id=>{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.classList.add('icon','disclosure-icon');svg.setAttribute('aria-hidden','true');
  const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href',`#${id}`);svg.append(use);return svg;
};
let disclosureId=0;
// The controls stay together; the requested content expands below them in the
// same sheet. Native buttons keep Enter/Space and focus behavior predictable.
const disclosure=(label,className,onOpen=()=>{})=>{
  const content=node('div','','decision-detail-panel');content.id=`decision-detail-${++disclosureId}`;content.hidden=true;
  const control=button('',()=>{
    content.hidden=!content.hidden;control.setAttribute('aria-expanded',String(!content.hidden));
    if(!content.hidden)onOpen(content);
  });
  control.className=className;control.setAttribute('aria-expanded','false');control.setAttribute('aria-controls',content.id);
  control.append(node('span',label),icon('i-chevron'));
  return {control,content};
};

export class OfficeDecisions {
  constructor(session){this.session=session;this.delivery=null;this.deliveryTimer=null;}
  // The backend request is always actionable. The room gets at most two seconds
  // to catch up, and explicitly opening a decision settles presentation at once.
  get request(){
    const run=this.session.taskRun,bridge=this.session.decisionContinuation;
    if(bridge&&run&&bridge.id===run.id&&bridge.round===run.round&&run.pending?.action==='ask_note')return null;
    return run&&!terminal(run)?run.pending:null;
  }
  get arriving(){return !!(this.request&&this.delivery?.key===`${this.session.run.id}:${this.request.id}`&&!this.delivery.ready);}
  get pending(){return this.arriving?null:this.request;}
  get arrivalLabel(){return this.session.run?.config.workflow==='direct'?'Result arriving':this.session.run?.config.workflow==='double_review'?'Reviews arriving':'Review arriving';}
  observe({replay=false}={}){
    const request=this.request,run=this.session.run;
    if(!request){clearTimeout(this.deliveryTimer);this.delivery=null;return;}
    const key=`${run.id}:${request.id}`;
    if(this.delivery?.key!==key){
      clearTimeout(this.deliveryTimer);
      // Server-projected dependencies include hidden controls and role events.
      // Older servers still work without a presentation graph.
      this.delivery={key,after:request.after||[],ready:false,announced:false};
      this.deliveryTimer=setTimeout(()=>{
        if(this.delivery?.key===key)this.releaseDelivery(true);
      },2000);
    }
    if(replay){this.delivery.ready=true;this.delivery.announced=true;clearTimeout(this.deliveryTimer);}
    this.checkDelivery(false);
  }
  checkDelivery(refresh=true){
    if(!this.arriving)return;
    if(this.session.scene.paused||this.session.scene.handoffs.satisfied(this.delivery.after))this.releaseDelivery(false,refresh);
  }
  releaseDelivery(fallback=false,refresh=true){
    if(!this.arriving)return;
    this.delivery.ready=true;clearTimeout(this.deliveryTimer);
    const s=this.session;
    // This changes presentation only. A broken/missing trace cannot prevent
    // access to a real backend decision.
    if(fallback&&!s.scene.paused)s.scene.handoffs.settle('decision');
    if(s.connected&&!this.delivery.announced){
      this.delivery.announced=true;
      if(!s.scene.paused||!s.scene.handoffs.queue.length)s.scene.handoffs.speak('human',s.run.config.workflow==='double_review'?'BOTH REVIEWS READY.\nYOUR DECISION.':'YOUR DECISION.',{force:true});
    }
    if(refresh){
      s.refreshChrome();s.updateRunWindow();
      if(s.connected&&s.scene.selected==='human'&&s.scene.ui.panel==='person-card'&&!$('person-card').hidden&&!$('detail-dialog').open){
        s.scene.ui.dismiss(false);this.open();
      }
    }
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
    if(this.arriving){this.releaseDelivery(true,false);this.session.refreshChrome();}
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
    const paired=run.config.workflow==='double_review';
    const recommendation= recommended==='Ship it'?'shipping':recommended?.toLowerCase();
    const title=paired?(summary.disagreement?'The reviewers disagree':recommended?`Both reviewers recommend ${recommendation}`:'Reviews need your decision'):recommended?`Reviewer recommends ${recommendation}`:run.config.workflow==='direct'?'The Worker’s result is ready':'Review needs your decision';
    host.append(node('h3',select?title:'Add any final guidance','decision-recommendation'));
    if(summary.reason)host.append(node('p',paired&&summary.disagreement?summary.reason.replace(/^The reviewers disagree\. /,''):summary.reason,'decision-reason'));
    if(summary.worker&&summary.worker!==summary.reason)host.append(node('p',`Worker: ${summary.worker}`,'decision-worker'));
    for(const gap of summary.verification||[])host.append(node('p',gap,'decision-verification'));
    if(paired){const opinions=node('div','','reviewer-opinions');for(const review of summary.reviewers||[]){const item=node('p','','field-help');item.append(node('strong',review.name+' · '),node('span',review.recommendation||'Needs clarification'));opinions.append(item);}host.append(opinions);}
    if(!s.connected)host.append(node('p','Reconnecting. Your decision will be available when the room is connected.','field-help'));
    const actions=node('div','','decision-actions');
    const noteKey=`${run.id}:${pending.id}`,savedNote=s.guidanceDrafts.get(noteKey)||'';
    const limit=run.round>=run.config.max_rounds;
    if(select){
      const available=choices.filter(choice=>!limit||choice!=='Another round');
      const primary=(available.includes(recommended)?recommended:null)||(paired&&available.includes('Another round')?'Another round':null)||(available.includes('Done')?'Done':available.includes('Ship it')?'Ship it':available[0]);
      const label=choice=>choice==='Another round'?'Run next round':choice;
      const makeAction=(choice,main=false)=>{
        const action=button(label(choice),()=>s.answer(pending.id,choice,{note:s.guidanceDrafts.get(noteKey)||'',noteKey}),main);
        action.disabled=!s.connected||(choice==='Another round'&&limit);return action;
      };
      const controls=node('div','','decision-controls');actions.append(makeAction(primary,true));controls.append(actions);
      for(const choice of available)if(choice!==primary)actions.append(makeAction(choice));
      host.append(controls);
      if(limit&&choices.includes('Another round'))host.append(node('p','The round limit is reached. Finish or abandon this run.','field-help'));
    }
    if(!select||(choices.includes('Another round')&&!limit)){
      const details=node('details','','decision-note');details.open=!!savedNote;
      const noteSummary=node('summary'),noteIcon=icon('i-zoom-in');
      noteSummary.append(noteIcon,node('span','Add a note for the Worker'));details.append(noteSummary);
      const updateIcon=()=>noteIcon.querySelector('use').setAttribute('href',details.open?'#i-zoom-out':'#i-zoom-in');
      details.ontoggle=updateIcon;updateIcon();
      const note=input('decision-note',savedNote,true);note.rows=3;note.maxLength=30000;note.disabled=!s.connected;
      note.placeholder='What would you like the Worker to focus on?';
      note.oninput=()=>s.guidanceDrafts.set(noteKey,note.value);
      details.append(field('Optional note',note),node('p',run.config.workflow==='direct'?'Optional. Add emphasis, corrections, or extra instructions.':paired?'Optional. Both full reviews and their exchange are passed to the Worker automatically. Your note also updates the task for both reviewers.':'Optional. The reviewer feedback will already be passed to the Worker automatically. Your note also updates the task for the Reviewer.','field-help'));
      host.append(details);
      // Compatibility for a pre-upgrade run already waiting at ask_note.
      if(!select){const go=button('Run next round',()=>s.answer(pending.id,note.value,{noteKey}),true);go.disabled=!s.connected;host.append(go);}
    }
    if(summary.task_issue){
      const edit=button('Edit task before rerunning',()=>this.editTask(pending.id));edit.className='edit-decision-task';edit.disabled=!s.connected;
      host.append(edit,node('p','Clarify the task before starting a fresh run.','field-help'));
    }
    const information=node('section','','decision-information'),infoTitle=node('h4','More information'),infoControls=node('div','','decision-information-controls');
    infoTitle.id='decision-information-title';information.setAttribute('aria-labelledby',infoTitle.id);
    const why=disclosure(limit?(run.config.workflow==='direct'?'Worker summary':'Reviewer rationale'):recommended==='Another round'?'Why another round?':recommended==='Ship it'?'Why ship it?':'Why is a decision required?','decision-disclosure');
    const worker=node('section');worker.append(node('h4','Worker'),node('p',summary.worker||withoutSummary(report(run,'Implementer'))||'No worker summary was returned.','decision-evidence'));why.content.append(worker);
    if(paired){
      for(const review of summary.reviewers||[]){const section=node('section');section.append(node('h4',review.name),node('p',review.reason,'decision-evidence'));if(review.format_issue)section.append(node('p',review.format_issue,'field-help'));why.content.append(section);}
    }else if(run.config.workflow!=='direct'){
      const review=node('section');review.append(node('h4','Reviewer rationale'),node('p',summary.reason||'No concise rationale was returned. Full findings are in Technical details.','decision-evidence'));if(summary.format_issue)review.append(node('p',summary.format_issue,'field-help'));why.content.append(review);
    }
    let loaded=false;
    const technical=disclosure('Technical details','decision-disclosure',content=>{
      if(loaded)return;loaded=true;
      content.append(node('p',run.config.workspace,'repository-path'));
      const progress=node('div'),reports=node('div'),tools=node('div');
      s.scene.activity.renderRecent(progress,null,12,run);s.renderReports(reports,run);s.renderToolLog(tools,run);
      content.append(progress,reports,tools);
      for(const heading of content.querySelectorAll('summary')){
        heading.classList.add('decision-nested-summary');heading.prepend(icon('i-chevron'));
      }
    });
    infoControls.append(why.control,technical.control);
    information.append(infoTitle,infoControls,why.content,technical.content);host.append(information);
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
