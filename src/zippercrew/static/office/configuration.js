import {api,node,button,field,input,select,terminal,roles,displayReport} from './session.js';
import {BOARD} from './task-board.js';
import {setupHighlightTexture} from './attention.js';
import {VIEW} from './world.js';
import {repositoryField} from './repository-picker.js';
import {TaskDrafts} from './task-drafts.js';
import {RoomOptions} from './room-options.js';
import {CHARACTER_DESIGNS} from './characters.js';
const $=id=>document.getElementById(id);
const avatars=Object.entries(CHARACTER_DESIGNS).map(([id,design])=>[id,design.name]);
const roleNames={worker:'Worker',reviewer:'Reviewer',planner:'Critical reviewer'};
const actorForRole={Implementer:'worker',Reviewer:'reviewer',Critic:'planner'};
const formation=id=>id==='direct'?'You → Worker → You':id==='double_review'?'You → Worker → Two reviewers → You':'You → Worker → Reviewer → You';

// Studio preferences, room formation, and role bindings have separate owners.
// Every execution still consumes an immutable snapshot of its room.
export class OfficeConfiguration {
  constructor(session){
    this.session=session;this.scene=session.scene;this.section='rooms';this.drawerRequest=0;this.markers=new Map();this.drafts=new TaskDrafts(session);this.options=new RoomOptions(session);
    for(const section of ['rooms','history'])$(`show-${section}`).onclick=()=>this.showDrawer(section);
    $('room-header').onclick=()=>session.decisions.request?session.decisions.open():this.saveState?.kind==='task'?this.editTask():this.roomPanel();
  }
  get editable(){return !!this.session.room&&terminal(this.session.run);}
  get workflow(){return this.session.room?.config.workflow||'review';}
  get team(){return (this.workflows[this.workflow]?.roles||[]).map(role=>{const id=actorForRole[role];return [id,this.workflow==='double_review'&&id==='reviewer'?'Delivery reviewer':roleNames[id]];});}
  get workflows(){return this.session.bootstrap?.workflows||{};}
  binding(id){return this.session.room?.config.agents?.[roles[id]]||{};}
  hasModel(id){const b=this.binding(id);return !!(b.profile&&(this.session.bootstrap?.demo||this.session.profiles[b.profile]));}
  modelIssue(id){
    if(this.session.bootstrap?.demo)return null;
    const binding=this.binding(id),profile=this.session.profiles[binding.profile];
    if(!profile)return null;
    const model=(binding.settings?.model||profile.model||'').trim();
    const effort=(binding.settings?.reasoning_effort||profile.reasoning_effort||'').trim().toLowerCase();
    const levels=this.session.bootstrap?.models?.find(m=>m.backend===profile.backend&&m.model===model)?.efforts;
    if(model&&effort&&levels?.length&&!levels.includes(effort))return `Choose a supported reasoning effort for ${model}. “${effort}” is not listed for this model.`;
    return null;
  }
  isReady(id){return this.hasModel(id)&&!this.modelIssue(id);}
  setupStatus(id){return !this.hasModel(id)?'Choose model':this.modelIssue(id)?'Check reasoning effort':null;}
  setupProblem(id,message){
    const s=this.session,name=this.team.find(([actor])=>actor===id)?.[1]||'Agent';
    s.window('agent-setup','Room / Team',`${name} settings need attention`,message);
    $('detail-body').append(button(`Configure ${name}`,()=>{$('detail-dialog').close();this.scene.select(id);},true));
  }
  model(id){const b=this.binding(id),p=this.session.profiles[b.profile];return b.settings?.model||p?.model||(this.session.bootstrap?.demo&&b.profile?'Scripted demo':p?(p.backend==='claude'?'Claude configured default':'Codex built-in default'):'Choose model');}
  get saveState(){
    const id=this.session.room?.id,task=this.drafts.rooms.get(id),options=this.options.rooms.get(id);
    if(task?.error)return {kind:'task',error:true,label:'Task not saved'};
    if(options?.error)return {kind:'room',error:true,label:'Room not saved'};
    if(task&&(task.pending||task.value!==task.saved))return {kind:'task',error:false,label:task.pending?'Saving task…':'Unsaved task'};
    if(options&&(options.pending||this.options.dirty(options)))return {kind:'room',error:false,label:options.pending?'Saving room…':'Unsaved room'};
    return null;
  }
  missing(){
    const s=this.session,missing=[];
    if(!s.room?.config.workspace)missing.push('Choose a repository in the room panel');
    if(!s.room?.brief?.trim())missing.push('Add a task on the whiteboard');
    if(this.saveState?.error)missing.push(this.saveState.label+' · open it to retry');
    for(const [id,name]of this.team){if(!this.hasModel(id))missing.push(`Choose ${name.toLowerCase()} model`);else if(this.modelIssue(id))missing.push(`${name}: check reasoning effort`);}
    return missing;
  }
  sync(){
    this.scene.setWorkflow(this.workflow);
    for(const [id,name]of this.team){
      const p=this.scene.people.get(id);p.role=name;p.appearance=this.binding(id).avatar||id;
      p.name=CHARACTER_DESIGNS[p.appearance].name;
      p.sprite.setTexture(this.scene.lighting.characterKey(p),p.sprite.frame.name);
      const tag=p.nameTag;tag.setTexture(this.scene.nameTexture(p));
      tag.setOrigin(Math.floor(tag.width/2)/tag.width,Math.floor(tag.height/2)/tag.height);
    }
    this.scene.paused=this.session.preferences?.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('agent-controls').dataset.key='';
    if(this.scene.selected){this.scene.updatePerson();this.scene.portrait($('person-portrait'),this.scene.selected);}
  }
  async save(data){
    const s=this.session,id=s.room.id;await this.drafts.flush(id);await this.options.flush(id);const saved=await api(`/api/rooms/${id}/save`,data);
    if(s.room?.id!==id)return;
    s.room={...s.room,...saved};this.sync();s.refreshChrome();
  }
  async saveBinding(id,changes){
    await this.options.flush(this.session.room.id);
    const config=structuredClone(this.session.room.config);
    config.agents[roles[id]]={...this.binding(id),...changes};await this.save({config});
  }
  toggleDrawer(){if(!$('studio-menu').hidden){this.scene.ui.closePopovers();return;}return this.showDrawer(this.section);}
  async showDrawer(section){
    if(this.session.busy&&this.session.room)return;
    $('detail-dialog').close();
    // Switching sections leaves the drawer and its existing content in place
    // until the next page is ready. Late responses cannot replace a newer tab.
    const opening=$('studio-menu').hidden;if(opening)this.scene.ui.dismiss(false);
    this.section=section;const request=++this.drawerRequest;
    $('studio-menu').hidden=false;$('menu-toggle').setAttribute('aria-expanded','true');
    for(const b of document.querySelectorAll('[data-section]'))b.setAttribute('aria-current',String(b.dataset.section===section));
    if(opening)$(`show-${section}`).focus();
    const host=node('div','','drawer-page'),content=$('drawer-content');host.dataset.section=section;
    content.setAttribute('aria-busy','true');$('drawer-error').hidden=true;
    try{
      if(section==='rooms')await this.rooms(host);else if(section==='history')await this.history(host);
      if(request!==this.drawerRequest)return;
      content.replaceChildren(host);
    }catch(error){
      if(request!==this.drawerRequest)return;
      $('drawer-error').textContent=error.message;$('drawer-error').hidden=false;
    }finally{if(request===this.drawerRequest)content.setAttribute('aria-busy','false');}
  }
  portrait(id,appearance){
    const c=node('canvas');c.width=32;c.height=36;c.dataset.portrait=id;
    if(appearance)c.dataset.appearance=appearance;
    this.scene.portrait(c,id);
    return c;
  }
  roster(host){
    for(const [id,name]of this.team){
      const row=node('div','','lineup-row'),avatar=button('',()=>this.avatarChooser(id));
      avatar.className='avatar-button';avatar.setAttribute('aria-label',`${name} avatar`);avatar.disabled=!this.editable;avatar.append(this.portrait(id));
      const info=node('div'),role=button(name,()=>{$('detail-dialog').close();this.scene.select(id);});role.className='role-link';
      const model=button(this.model(id),()=>{$('detail-dialog').close();this.scene.select(id);});model.className='model-link';model.disabled=!this.editable;model.setAttribute('aria-label',`${name} model`);info.append(role,model);
      const ready=this.isReady(id);
      const status=node('span',this.setupStatus(id)||'✓ Ready','readiness');status.dataset.ready=ready;
      row.append(avatar,info,status);host.append(row);
    }
  }
  agentCard(person){
    const host=$('agent-controls');
    if(person.id==='human'){host.dataset.key='';host.replaceChildren(node('p',this.session.decisions.arriving?'The handover is on its way. Your decision will open when it arrives.':'Walk with the arrow keys or WASD.','field-help'));return;}
    const key=`${this.session.room?.id}:${person.id}:${this.editable}`;if(host.dataset.key===key)return;host.dataset.key=key;host.replaceChildren();
    if(!this.session.room){host.append(button('+ New room',()=>this.newRoom(),true));return;}
    const s=this.session,id=person.id,b=this.binding(id),profile=s.profiles[b.profile];
    const explanation=this.workflows[this.workflow]?.role_descriptions?.[roles[id]];
    if(explanation)host.append(node('p',explanation,'field-help role-explanation'));
    const form=node('form','','agent-form'),choices=node('div','','agent-avatar-options');
    choices.setAttribute('role','group');choices.setAttribute('aria-label','Avatar');
    let appearance=b.avatar||id;
    for(const [value,name]of avatars){
      const option=button('',()=>{appearance=value;for(const choice of choices.children)choice.setAttribute('aria-pressed',String(choice===option));});
      option.append(this.portrait(id,value));option.setAttribute('aria-label',`${name} avatar`);option.title=name;
      option.setAttribute('aria-pressed',String(value===appearance));option.disabled=!this.editable;choices.append(option);
    }
    const options=this.modelOptions(id),current=JSON.stringify([profile?.backend||'demo',b.settings?.model||profile?.model||'']);
    const model=select('agent-model',[['','Select a model'],...options.map(o=>[o.key,o.label])],this.hasModel(id)?current:'');
    const currentEffort=(b.settings?.reasoning_effort||profile?.reasoning_effort||'').trim().toLowerCase();
    const effort=select('agent-effort',[],''),defaults=node('p','','field-help model-default-help');
    const updateEfforts=value=>{
      const choice=options.find(o=>o.key===model.value),supported=choice?.efforts,builtin=choice?.backend==='codex'&&!choice.model,efforts=['',...(builtin?[]:supported?.length?supported:['low','medium','high'])];
      if(value&&!efforts.includes(value))efforts.push(value);
      const choices=select('',efforts.map(v=>[v,v?v==='xhigh'?'Extra high':v.charAt(0).toUpperCase()+v.slice(1):'Default']),value);
      effort.replaceChildren(...choices.children);effort.value=value||'';
      const invalid=!!(choice?.model&&supported?.length&&value&&!supported.includes(value));
      effort.setCustomValidity(invalid?'Choose an effort listed for this model, or Default.':'');
      if(invalid)effort.selectedOptions[0].textContent+=' (not listed for this model)';
      else if(builtin&&value)effort.selectedOptions[0].textContent+=' (saved override)';
      effort.disabled=!this.editable||(builtin&&!value);
      defaults.textContent=choice?.model||!choice||choice.backend==='demo'?'':choice.backend==='codex'
        ?'Uses Codex’s built-in model, not your Codex config. Choose a named model to set a supported reasoning effort. An existing saved override is kept until you change it.'
        :'Uses your Claude settings unless you choose an effort here. Effort options come from the installed CLI and may vary by model.';
      defaults.hidden=!defaults.textContent;
    };
    const access=node('p','','field-help agent-access');access.id='agent-access';model.setAttribute('aria-describedby',access.id);
    const updateAccess=()=>{
      const backend=options.find(o=>o.key===model.value)?.backend;
      access.textContent=backend==='claude'?(id==='worker'
        ?'Edits only. Claude cannot run tests or commands that need approval in this app. Use a Codex Worker when command execution is required.'
        :'File review only. Claude reviewers can read and search files, but cannot run tests or shell commands.')
        :backend==='codex'&&id!=='worker'?'Read-only review. Checks that need to write files may be blocked.':'';
      access.hidden=!access.textContent;
    };
    effort.onchange=()=>updateEfforts(effort.value);
    updateEfforts(currentEffort);updateAccess();model.onchange=()=>{updateEfforts('');updateAccess();};
    model.disabled=!this.editable;
    const instructions=node('details','','agent-instructions');instructions.append(node('summary','Custom instructions · optional'));
    const prompt=input(`instructions-${roles[id]}`,b.instructions||'',true);prompt.rows=3;prompt.maxLength=30000;prompt.disabled=!this.editable;prompt.placeholder='Add guidance specific to this room.';
    instructions.append(field('Instructions',prompt));
    const save=button('Save agent',null,true);save.type='submit';save.disabled=!this.editable;
    form.append(node('span','Avatar','field-label'),choices,field('Model',model),access,field('Reasoning effort',effort),defaults,instructions,save);
    form.onsubmit=e=>{e.preventDefault();s.perform(async()=>{
      const chosen=options.find(option=>option.key===model.value);if(!chosen)throw Error('Select a model for this role.');
      const selected=chosen.backend==='demo'?'demo':await s.defaultProfile(s.room.config.project,chosen.backend),settings={};
      if(chosen.model)settings.model=chosen.model;if(effort.value)settings.reasoning_effort=effort.value;
      await this.saveBinding(id,{profile:selected,settings,avatar:appearance,instructions:prompt.value});
      s.confirmInOffice(id,'Ready for the next task.');
    });};
    host.append(form);
    if(!this.editable)host.append(node('p','This run uses its saved team. Edit after it finishes.','field-help'));
  }
  modelOptions(id){
    const s=this.session,options=new Map();
    const add=(backend,model='',label=null,efforts=[])=>{
      const key=JSON.stringify([backend,model]),provider=backend==='claude'?'Claude':'Codex';
      if(!options.has(key))options.set(key,{key,backend,model,efforts,label:label||(backend==='demo'?'Scripted demo':model?`${model} · ${provider}`:(backend==='codex'?'Codex built-in default':'Claude configured default'))});
    };
    if(s.bootstrap.demo)add('demo');else{
      for(const backend of ['codex','claude']){
        const efforts=backend==='codex'?[]:[...new Set((s.bootstrap.models||[]).filter(m=>m.backend===backend).flatMap(m=>m.efforts||[]))];
        add(backend,'',null,efforts);
      }
    }
    for(const m of s.bootstrap.models||[])add(m.backend,m.model,m.label,m.efforts);
    for(const p of Object.values(s.profiles))if(p.model)add(p.backend,p.model);
    for(const [role]of this.team){const b=this.binding(role),p=s.profiles[b.profile];if(p)add(p.backend,b.settings?.model||p.model||'');}
    return [...options.values()];
  }
  avatarChooser(id){
    if(!this.editable)return;
    const s=this.session;s.window('avatar',`${s.room.name} / ${roleNames[id]}`,'Choose an avatar');
    const grid=node('div','','avatar-grid');
    for(const [appearance,name]of avatars){const option=button('',()=>s.perform(async()=>{await this.saveBinding(id,{avatar:appearance});s.confirmInOffice(id,'Looking good.\nBack to the room.');}));option.append(this.portrait(id,appearance),node('span',name));option.setAttribute('aria-label',`Choose ${name} avatar`);option.setAttribute('aria-pressed',String((this.binding(id).avatar||id)===appearance));grid.append(option);}
    $('detail-body').append(grid);
  }
  workflowCards(host,action,selected){
    const list=node('div','','workflow-options');
    for(const [id,w]of Object.entries(this.workflows)){
      const card=button('',()=>action(id));card.className='choice-card workflow-choice';card.dataset.workflow=id;card.setAttribute('aria-label',w.name);card.setAttribute('aria-pressed',String(id===selected));
      card.append(node('strong',w.name),node('span',formation(id),'formation'),node('small',w.description));list.append(card);
    }
    host.append(list);
  }
  newRoom(){
    const s=this.session;s.window('new-room','Studio / Rooms','New room','What should this room do?');
    const name=input('setup-name','');name.placeholder='Room name (optional)';name.maxLength=120;
    $('detail-body').append(field('Room name',name));
    this.workflowCards($('detail-body'),workflow=>s.perform(async()=>{
      const agents={};for(const role of this.workflows[workflow].roles)agents[role]={profile:s.bootstrap.demo?'demo':'',instructions:''};
      const room=await api('/api/rooms',{name:name.value.trim()||'Untitled room',brief:'',config:{workflow,project:s.bootstrap.project,workspace:'',agents}});
      if(await s.loadRoom(room.id)===false)return;s.confirmInOffice('worker','Room ready.\nAdd a task on the whiteboard.');
    }));
    name.focus();
  }
  roomPanel(){
    const s=this.session;if(!s.room){this.newRoom();return;}
    s.window('room','Studio / Room',s.room.name);
    const draft=this.options.get(s.room);
    const current=this.workflows[this.workflow],workflow=button('',()=>s.perform(async()=>{await this.options.flush(draft.id);this.workflowChooser();}));workflow.className='room-workflow';workflow.disabled=!this.editable;
    workflow.append(node('small','Workflow'),node('strong',`${current.name}  ›`),node('span',formation(this.workflow),'formation'));
    const form=node('form','','room-form'),name=input('settings-room-name',draft.value.name),path=input('settings-workspace',draft.value.workspace);
    name.maxLength=120;name.required=true;name.className='room-title-input';name.setAttribute('aria-label','Room name');name.title='Edit room name';
    $('detail-title').replaceChildren(name);
    path.placeholder='~/projects/my-app';path.disabled=!this.editable;
    form.append(repositoryField(path));
    const advanced=node('details','','extra-options'),rounds=input('settings-rounds',draft.value.max_rounds);rounds.type='number';rounds.min=1;rounds.max=100;rounds.disabled=!this.editable;
    const involvement=select('settings-involvement',[['brief','Short review'],['full','Full review'],['auto',this.workflow==='double_review'?'Require both reviewers’ approval':'Let the reviewer decide']],draft.value.human_mode);involvement.disabled=!this.editable;
    advanced.append(node('summary','Advanced'),field('Maximum rounds',rounds));if(this.workflow!=='direct')advanced.append(field('Your involvement',involvement));
    const status=node('span','','autosave-status'),retry=button('Retry save',()=>this.options.flush(draft.id).catch(()=>{})),saveLine=node('div','','autosave-line room-save-status');
    status.setAttribute('role','status');retry.className='retry-save';saveLine.append(status,retry);
    const update=()=>{status.textContent=draft.error?'Not saved — '+draft.error:draft.pending?'Saving…':this.options.dirty(draft)?'Unsaved changes':'';saveLine.hidden=!status.textContent;status.dataset.error=String(!!draft.error);retry.hidden=!draft.error;};
    draft.listeners.clear();draft.listeners.add(update);update();
    if(draft.error&&(!Number.isInteger(Number(rounds.value))||Number(rounds.value)<1||Number(rounds.value)>100)){advanced.open=true;rounds.setAttribute('aria-invalid','true');rounds.focus();}
    for(const [key,control]of Object.entries({name,workspace:path,max_rounds:rounds,human_mode:involvement})){
      control.oninput=()=>{control.removeAttribute('aria-invalid');this.options.edit(draft,key,control.value);};
      control.onchange=()=>{if(draft.value[key]!==control.value)this.options.edit(draft,key,control.value);this.options.flush(draft.id).catch(()=>{});};
      control.onblur=()=>this.options.flush(draft.id).catch(()=>{});
    }
    name.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();name.blur();}};
    form.append(advanced,saveLine);form.onsubmit=e=>{e.preventDefault();this.options.flush(draft.id).catch(()=>{});};
    const team=node('details','','room-team');team.append(node('summary','Team'));const roster=node('div');this.roster(roster);team.append(roster);
    const remove=button('Delete room',()=>this.deleteRoom(s.room));remove.className='quiet-danger';
    const help=node('details','','workflow-help');help.append(node('summary','How this workflow works'),node('p',current.explanation,'field-help'));
    for(const [role,text]of Object.entries(current.role_descriptions||{}))if(role!=='Implementer')help.append(node('p',text,'field-help'));
    $('detail-body').append(workflow,help,form,team,remove);
    if(!this.editable)$('detail-body').append(node('p','Stop or finish this run before changing its room.','field-help'));
  }
  workflowChooser(){
    if(!this.editable)return;
    const s=this.session;s.window('workflow',`${s.room.name} / Workflow`,'Choose a workflow');
    this.workflowCards($('detail-body'),id=>this.changeWorkflow(id),this.workflow);
  }
  changeWorkflow(id){
    if(id===this.workflow){this.roomPanel();return;}
    const s=this.session,config=structuredClone(s.room.config),retained={};
    for(const role of this.workflows[id].roles)retained[role]=config.agents[role]||{profile:s.bootstrap.demo?'demo':'',instructions:''};
    const removed=Object.entries(config.agents).filter(([role,b])=>!retained[role]&&(b.instructions||Object.keys(b.settings||{}).length||b.avatar||(b.profile&&b.profile!=='demo')));
    const save=confirm=>s.perform(async()=>{await this.save({config:{...config,workflow:id,agents:retained},confirm_workflow:confirm});s.confirmInOffice('worker',`${this.workflows[id].name} workflow ready.`);});
    if(!removed.length){save(false);return;}
    s.window('workflow-confirm',`${s.room.name} / Workflow`,`Switch to ${this.workflows[id].name}?`,`This removes ${removed.map(([role])=>role==='Critic'?'the Critical reviewer':'the Reviewer').join(' and ')} and their saved configuration. The Worker, task, and previous runs are kept.`);
    const actions=node('div','','form-actions');actions.append(button(`Keep ${this.workflows[this.workflow].name}`,()=>this.roomPanel()),button(`Switch to ${this.workflows[id].name}`,()=>save(true),true));$('detail-body').append(actions);
  }
  editTask(){
    const s=this.session;if(!s.room){this.newRoom();return;}if(!this.editable){s.showTask();return;}
    s.window('task-edit',`${s.room.name} / Whiteboard`,'Your task','The first line becomes the title on the board.');
    const draft=this.drafts.get(s.room),form=node('form','','room-form'),brief=input('setup-brief',draft.value,true);brief.rows=5;brief.maxLength=30000;brief.placeholder='What should the team do?\n\nDescribe the result you want.';
    const status=node('span','','autosave-status'),retry=button('Retry save',()=>this.drafts.flush(draft.id).catch(()=>{}));
    status.setAttribute('role','status');retry.className='retry-save';
    const saveLine=node('div','','autosave-line');saveLine.append(status,retry);
    const start=button('Run task',null,true);start.type='submit';
    const update=()=>{status.textContent=draft.error?'Not saved — '+draft.error:draft.pending?'Saving…':draft.value!==draft.saved?'Unsaved changes':'';saveLine.hidden=!status.textContent;status.dataset.error=String(!!draft.error);retry.hidden=!draft.error;start.disabled=!!this.missing().length;start.title=this.missing().join(' · ');};
    draft.listeners.clear();draft.listeners.add(update);update();
    brief.oninput=()=>this.drafts.edit(draft,brief.value);brief.onblur=()=>this.drafts.flush(draft.id).catch(()=>{});
    const editor=node('div','','form-field');brief.setAttribute('aria-label','Task');brief.setAttribute('aria-describedby','detail-description');editor.append(brief);
    form.append(editor,saveLine,start);
    form.onsubmit=e=>{e.preventDefault();this.start();};$('detail-body').append(form);brief.focus();
  }
  start(){return this.session.perform(async()=>{
    const invalid=this.team.find(([id])=>this.modelIssue(id));
    if(invalid){this.setupProblem(invalid[0],this.modelIssue(invalid[0]));return;}
    await this.launch();
  },{errorKind:'Room / Run'});}
  async launch(){const id=this.session.room.id;await this.drafts.flush(id);await this.options.flush(id);const missing=this.missing();if(missing.length)throw Error(missing.join('\n'));const run=await api(`/api/rooms/${id}/runs`,{});this.session.attach(run,{replay:false});this.session.confirmInOffice('human','Task sent.\nThe team can begin.');}
  async rooms(host){
    const rooms=await api('/api/rooms');
    const list=node('ul','','room-list');list.setAttribute('aria-label','Rooms');host.append(list);
    for(const room of rooms){
      const row=node('li','','room-row'),current=room.id===this.session.room?.id;
      const enter=button('',()=>this.session.openRoom(room.id));enter.setAttribute('aria-label',`Enter ${room.name}`);enter.className='enter-room';
      const mark=node('span',current?'✓':'','room-current-mark');mark.setAttribute('aria-hidden','true');
      enter.append(mark);if(current)enter.setAttribute('aria-current','location');
      const info=node('div','','room-entry'),name=button(room.name,()=>this.renameRoom(room,name,enter,trash));
      name.className='room-entry-name';name.title='Rename room';name.setAttribute('aria-label',`Rename ${room.name}`);
      const workflow=this.workflows[room.config.workflow||'review'].name,status=room.latest?.status||'idle';
      info.append(name,node('small',`${workflow} · ${status}`,'room-entry-meta'));
      const trash=button('',()=>this.deleteRoom(room));trash.setAttribute('aria-label',`Delete ${room.name}`);trash.className='delete-room';
      const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),use=document.createElementNS('http://www.w3.org/2000/svg','use');icon.classList.add('icon');icon.setAttribute('aria-hidden','true');use.setAttribute('href','#i-trash');icon.append(use);trash.append(icon);
      row.dataset.current=String(current);row.append(enter,info,trash);list.append(row);
    }
    if(!rooms.length)host.append(node('p','Your first room starts with a workflow.','empty-state'));
    const create=button('+ New room',()=>this.newRoom());create.className='new-room';host.append(create);
  }
  renameRoom(room,name,enter,trash){
    const editor=input('',room.name);editor.className='room-rename';editor.maxLength=120;
    editor.setAttribute('aria-label',`Rename ${room.name}`);name.replaceWith(editor);editor.focus();editor.select();
    let saving=false,finished=false;
    const finish=()=>{
      finished=true;const focused=document.activeElement===editor;
      name.textContent=room.name;name.setAttribute('aria-label',`Rename ${room.name}`);
      enter.setAttribute('aria-label',`Enter ${room.name}`);trash.setAttribute('aria-label',`Delete ${room.name}`);
      editor.replaceWith(name);if(focused)name.focus();
    };
    const save=async()=>{
      if(saving||finished)return;
      const value=editor.value.trim();if(!value||value===room.name){finish();return;}
      saving=true;editor.readOnly=true;$('drawer-error').hidden=true;
      try{
        await this.options.flush(room.id);const saved=await api(`/api/rooms/${room.id}/save`,{name:value});room.name=saved.name;
        if(this.session.room?.id===room.id){this.session.room.name=saved.name;this.session.refreshChrome();}
        finish();
      }catch(error){if(editor.isConnected){$('drawer-error').textContent=error.message;$('drawer-error').hidden=false;editor.setAttribute('aria-invalid','true');}}
      finally{saving=false;editor.readOnly=false;}
    };
    editor.onblur=save;
    editor.onkeydown=event=>{
      if(event.key==='Enter'){event.preventDefault();event.stopPropagation();save();}
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!saving)finish();}
    };
  }
  deleteRoom(room){
    const s=this.session;s.window('delete','Studio / Rooms',`Delete ${room.name}?`,'This removes the room and its history. Repository files remain.');
    const actions=node('div','','form-actions');actions.append(button('Cancel',()=>{$('detail-dialog').close();this.showDrawer('rooms');}),button('Delete room',()=>s.perform(async()=>{await api(`/api/rooms/${room.id}/delete`,{confirmation:room.name});this.drafts.rooms.delete(room.id);this.options.rooms.delete(room.id);if(s.room?.id===room.id){s.stream?.close();s.stream=null;s.scene.handoffs.reset();s.scene.activity.reset();s.scene.ambient.cancel();s.room=null;s.run=null;history.replaceState(null,'',location.pathname+location.search);const rooms=await api('/api/rooms');if(rooms.length)await s.loadRoom(rooms[0].id);else{this.sync();s.refreshChrome();}}$('detail-dialog').close();setTimeout(()=>this.showDrawer('rooms'),0);}),true));$('detail-body').append(actions);
  }
  async history(host){
    host.append(node('h2','History'),node('p','Past runs and conversations across your studio.','field-help'));
    const rooms=(await api('/api/rooms')).filter(room=>room.runs.length);
    const histories=await Promise.all(rooms.map(room=>api(`/api/rooms/${room.id}/runs`)));
    for(const [index,room]of rooms.entries()){
      host.append(node('h3',room.name,'history-room'));const runs=histories[index];
      for(const run of runs){const link=button('',()=>this.session.perform(async()=>{const state=await api(`/api/runs/${run.id}`);this.session.window('history-run',`${room.name} / History`,`Run ${run.number}`,state.config.task);const progress=node('div'),reports=node('div'),tools=node('div');this.scene.activity.renderRecent(progress,null,12,state);this.session.renderReports(reports,state);this.session.renderToolLog(tools,state);$('detail-body').append(node('p',displayReport(state.error||state.outcome||state.status).replace(/zg run trace --tail (20|40) --json/g,'History or Download full trace'),'run-summary'),progress,reports,tools);}));link.className='history-entry';link.setAttribute('aria-label',`Run ${run.number} · ${run.status}`);link.append(node('strong',`Run ${run.number} · ${run.status}`),node('small',run.task.split('\n')[0]));host.append(link);}
    }
    if(!rooms.length)host.append(node('p','Completed work will appear here.','empty-state'));
  }
  setupMarker(id){
    const scene=this.scene;
    const label=document.createElement('button');
    label.className='setup-action';label.type='button';label.hidden=true;
    label.dataset.setupObject=id;
    const open=()=>{
      if($('detail-dialog').open)return;
      if(id==='board')this.session.openCurrent();else scene.select(id);
    };
    label.onclick=event=>{event.stopPropagation();open();};
    $('game').append(label);
    const marker={ring:scene.add.image(0,0,'day:decision-ring:0').setVisible(false),label};
    marker.ring.contextOwner=id==='board'?'task-board':id;
    marker.ring.on('pointerup',(pointer,_x,_y,event)=>{
      if(pointer.event?.target!==scene.game.canvas||pointer.getDistance()>6)return;
      event.stopPropagation();open();
    });
    this.markers.set(id,marker);
    return marker;
  }
  updateAttention(){
    const s=this.session,scene=this.scene,active=!!s.room&&terminal(s.taskRun);
    for(const marker of this.markers.values()){
      marker.ring.setVisible(false).disableInteractive();
      marker.needed=false;
    }
    for(const id of ['board',...this.team.map(([id])=>id)]){
      const missing=id==='board'?!s.room?.brief?.trim():!this.isReady(id);
      if(!active||!missing)continue;
      const person=scene.people.get(id),marker=this.markers.get(id)||this.setupMarker(id);
      const board=id==='board';
      marker.needed=true;
      marker.ring.setTexture(setupHighlightTexture(scene,board));
      if(board){
        marker.ring.setOrigin(0).setPosition(BOARD.x-3,BOARD.y-3).setDepth(BOARD.y+BOARD.height+1);
      }else{
        // A light veil covers the avatar and chair foreground until setup is complete.
        marker.ring.setOrigin(.5).setPosition(Math.round(person.x),Math.round(person.y)-15).setDepth(Math.round(person.y)+3);
      }
      const text=board?'Click to add a task':this.modelIssue(id)?'Check effort':'Choose model';
      const label=marker.label;
      if(label.textContent!==text)label.textContent=text;
      label.setAttribute('aria-label',board?text:`${person.role}: ${text.toLowerCase()}`);
      // Application guidance is DOM text so it stays smooth over the pixel world.
      const x=board?BOARD.x+Math.floor(BOARD.width/2):Math.round(person.x);
      const y=board?BOARD.y+25:Math.round(person.y)-15;
      label.style.left=`${(x-VIEW.x)/VIEW.width*100}%`;
      label.style.top=`${(y-VIEW.y)/VIEW.height*100}%`;
      label.style.width=`${(board?BOARD.width-20:54)/VIEW.width*100}%`;
      label.style.fontSize=`${Math.max(12,Math.min(22,7*scene.physicalScale/(window.devicePixelRatio||1)))}px`;
      label.hidden=false;
      marker.ring.setVisible(true).setInteractive({useHandCursor:true});
      marker.ring.input.hitArea.setTo(0,0,marker.ring.width,marker.ring.height);
    }
    for(const marker of this.markers.values())if(!marker.needed)marker.label.hidden=true;
  }
}
