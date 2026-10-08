import {api,node,button,field,input,select,terminal,roles} from './session.js';
import {BOARD} from './task-board.js';
import {labelTexture} from './art.js';
import {repositoryField} from './repository-picker.js';
import {TaskDrafts} from './task-drafts.js';
import {RoomOptions} from './room-options.js';
const $=id=>document.getElementById(id);
const avatars=[['planner','Mira'],['worker','Theo'],['reviewer','Jules'],['human','Alex']];
const roleNames={worker:'Worker',reviewer:'Reviewer'};

// Studio preferences, room formation, and role bindings have separate owners.
// Every execution still consumes an immutable snapshot of its room.
export class OfficeConfiguration {
  constructor(session){
    this.session=session;this.scene=session.scene;this.section='rooms';this.drawerRequest=0;this.markers=new Map();this.drafts=new TaskDrafts(session);this.options=new RoomOptions(session);
    for(const section of ['rooms','history'])$(`show-${section}`).onclick=()=>this.showDrawer(section);
    $('room-header').onclick=()=>session.decisions.pending?session.decisions.open():this.roomPanel();
  }
  get editable(){return !!this.session.room&&terminal(this.session.run);}
  get workflow(){return this.session.room?.config.workflow||'review';}
  get team(){return (this.workflow==='direct'?['worker']:['worker','reviewer']).map(id=>[id,roleNames[id]]);}
  get workflows(){return this.session.bootstrap.workflows;}
  binding(id){return this.session.room?.config.agents?.[roles[id]]||{};}
  hasModel(id){const b=this.binding(id);return !!(b.profile&&(this.session.bootstrap?.demo||this.session.profiles[b.profile]));}
  isReady(id){return this.hasModel(id);}
  model(id){const b=this.binding(id),p=this.session.profiles[b.profile];return b.settings?.model||p?.model||(this.session.bootstrap?.demo&&b.profile?'Scripted demo':p?`${p.backend==='claude'?'Claude':'Codex'} default`:'Choose model');}
  missing(){
    const s=this.session,missing=[];
    if(!s.room?.config.workspace)missing.push('Choose a repository in the room panel');
    if(!s.room?.brief?.trim())missing.push('Add a task on the whiteboard');
    for(const [id,name]of this.team){if(!this.hasModel(id))missing.push(`Choose ${name.toLowerCase()} model`);}
    return missing;
  }
  sync(){
    this.scene.setWorkflow(this.workflow);
    for(const [id]of this.team){const p=this.scene.people.get(id);p.appearance=this.binding(id).avatar||id;p.sprite.setTexture(this.scene.lighting.characterKey(p),p.sprite.frame.name);}
    this.scene.paused=this.session.preferences?.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('agent-controls').dataset.key='';
    if(this.scene.selected)this.scene.ui.updatePerson();
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
    if(appearance){const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(this.scene.textures.get(`${this.scene.mood}:person-${appearance}`).getSourceImage(),0,0,32,36,0,0,32,36);}else this.scene.portrait(c,id);
    return c;
  }
  roster(host){
    for(const [id,name]of this.team){
      const row=node('div','','lineup-row'),avatar=button('',()=>this.avatarChooser(id));
      avatar.className='avatar-button';avatar.setAttribute('aria-label',`${name} avatar`);avatar.disabled=!this.editable;avatar.append(this.portrait(id));
      const info=node('div'),role=button(name,()=>{$('detail-dialog').close();this.scene.select(id);});role.className='role-link';
      const model=button(this.model(id),()=>{$('detail-dialog').close();this.scene.select(id);});model.className='model-link';model.disabled=!this.editable;model.setAttribute('aria-label',`${name} model`);info.append(role,model);
      const ready=this.isReady(id);
      const status=node('span',!this.hasModel(id)?'Choose model':'✓ Ready','readiness');status.dataset.ready=ready;
      row.append(avatar,info,status);host.append(row);
    }
  }
  agentCard(person){
    const host=$('agent-controls');
    if(person.id==='human'){host.dataset.key='';host.replaceChildren(node('p','Walk with the arrow keys or WASD.','field-help'));return;}
    const key=`${this.session.room?.id}:${person.id}:${this.editable}`;if(host.dataset.key===key)return;host.dataset.key=key;host.replaceChildren();
    if(!this.session.room){host.append(button('+ New room',()=>this.newRoom(),true));return;}
    const s=this.session,id=person.id,b=this.binding(id),profile=s.profiles[b.profile];
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
    const currentEffort=b.settings?.reasoning_effort||profile?.reasoning_effort||'';
    const effort=select('agent-effort',[],'');
    const updateEfforts=value=>{
      const supported=options.find(o=>o.key===model.value)?.efforts,efforts=['',...(supported?.length?supported:['low','medium','high'])];
      if(value&&!efforts.includes(value))efforts.push(value);
      const choices=select('',efforts.map(v=>[v,v?v==='xhigh'?'Extra high':v.charAt(0).toUpperCase()+v.slice(1):'Default']),value);
      effort.replaceChildren(...choices.children);effort.value=value||'';
    };
    updateEfforts(currentEffort);model.onchange=()=>updateEfforts('');
    model.disabled=effort.disabled=!this.editable;
    const instructions=node('details','','agent-instructions');instructions.append(node('summary','Custom instructions · optional'));
    const prompt=input(`instructions-${roles[id]}`,b.instructions||'',true);prompt.rows=3;prompt.maxLength=30000;prompt.disabled=!this.editable;prompt.placeholder='Add guidance specific to this room.';
    instructions.append(field('Instructions',prompt));
    const save=button('Save agent',null,true);save.type='submit';save.disabled=!this.editable;
    form.append(node('span','Avatar','field-label'),choices,field('Model',model),field('Reasoning effort',effort),instructions,save);
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
      if(!options.has(key))options.set(key,{key,backend,model,efforts,label:label||(backend==='demo'?'Scripted demo':model?`${model} · ${provider}`:`${provider} default`)});
    };
    if(s.bootstrap.demo)add('demo');else{add('codex');add('claude');}
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
      card.append(node('strong',w.name),node('span',id==='direct'?'You → Worker → You':'You → Worker → Reviewer → You','formation'),node('small',w.description));list.append(card);
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
      await s.loadRoom(room.id);s.confirmInOffice('worker','Room ready.\nAdd a task on the whiteboard.');
    }));
    name.focus();
  }
  roomPanel(){
    const s=this.session;if(!s.room){this.newRoom();return;}
    s.window('room','Studio / Room',s.room.name);
    const draft=this.options.get(s.room);
    const current=this.workflows[this.workflow],workflow=button('',()=>s.perform(async()=>{await this.options.flush(draft.id);this.workflowChooser();}));workflow.className='room-workflow';workflow.disabled=!this.editable;
    workflow.append(node('small','Workflow'),node('strong',`${current.name}  ›`),node('span',this.workflow==='direct'?'You → Worker → You':'You → Worker → Reviewer → You','formation'));
    const form=node('form','','room-form'),name=input('settings-room-name',draft.value.name),path=input('settings-workspace',draft.value.workspace);
    name.maxLength=120;name.required=true;name.className='room-title-input';name.setAttribute('aria-label','Room name');name.title='Edit room name';
    $('detail-title').replaceChildren(name);
    path.placeholder='~/projects/my-app';path.disabled=!this.editable;
    form.append(repositoryField(path));
    const advanced=node('details','','extra-options'),rounds=input('settings-rounds',draft.value.max_rounds);rounds.type='number';rounds.min=1;rounds.max=100;rounds.disabled=!this.editable;
    const involvement=select('settings-involvement',[['brief','Short review'],['full','Full review'],['auto','Let the reviewer decide']],draft.value.human_mode);involvement.disabled=!this.editable;
    advanced.append(node('summary','Advanced'),field('Maximum rounds',rounds));if(this.workflow==='review')advanced.append(field('Your involvement',involvement));
    const status=node('span','','autosave-status'),retry=button('Retry save',()=>this.options.flush(draft.id).catch(()=>{})),saveLine=node('div','','autosave-line room-save-status');
    status.setAttribute('role','status');retry.className='retry-save';saveLine.append(status,retry);
    const update=()=>{status.textContent=draft.error?'Not saved — '+draft.error:draft.pending?'Saving…':this.options.dirty(draft)?'Unsaved changes':'Saved automatically';status.dataset.error=String(!!draft.error);retry.hidden=!draft.error;};
    draft.listeners.clear();draft.listeners.add(update);update();
    for(const [key,control]of Object.entries({name,workspace:path,max_rounds:rounds,human_mode:involvement})){
      control.oninput=()=>this.options.edit(draft,key,control.value);
      control.onchange=()=>{if(draft.value[key]!==control.value)this.options.edit(draft,key,control.value);this.options.flush(draft.id).catch(()=>{});};
      control.onblur=()=>this.options.flush(draft.id).catch(()=>{});
    }
    name.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();name.blur();}};
    form.append(advanced,saveLine);form.onsubmit=e=>{e.preventDefault();this.options.flush(draft.id).catch(()=>{});};
    const team=node('details','','room-team');team.append(node('summary','Team'));const roster=node('div');this.roster(roster);team.append(roster);
    const remove=button('Delete room',()=>this.deleteRoom(s.room));remove.className='quiet-danger';
    $('detail-body').append(workflow,form,team,remove);
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
    s.window('workflow-confirm',`${s.room.name} / Workflow`,'Switch to Direct?','This removes the Reviewer and its saved model, avatar, and instructions. The Worker, task, and previous runs are kept.');
    const actions=node('div','','form-actions');actions.append(button('Keep Review',()=>this.roomPanel()),button('Switch to Direct',()=>save(true),true));$('detail-body').append(actions);
  }
  editTask(){
    const s=this.session;if(!s.room){this.newRoom();return;}if(!this.editable){s.showTask();return;}
    s.window('task-edit',`${s.room.name} / Whiteboard`,'Your task','The first line becomes the title on the board.');
    const draft=this.drafts.get(s.room),form=node('form','','room-form'),brief=input('setup-brief',draft.value,true);brief.rows=5;brief.maxLength=30000;brief.placeholder='What should the team do?\n\nDescribe the result you want.';
    const status=node('span','','autosave-status'),retry=button('Retry save',()=>this.drafts.flush(draft.id).catch(()=>{}));
    status.setAttribute('role','status');retry.className='retry-save';
    const saveLine=node('div','','autosave-line');saveLine.append(status,retry);
    const start=button('Run task',null,true);start.type='submit';
    const update=()=>{status.textContent=draft.error?'Not saved — '+draft.error:draft.pending?'Saving…':draft.value!==draft.saved?'Unsaved changes':'Saved automatically';status.dataset.error=String(!!draft.error);retry.hidden=!draft.error;start.disabled=!!this.missing().length;start.title=this.missing().join(' · ');};
    draft.listeners.clear();draft.listeners.add(update);update();
    brief.oninput=()=>this.drafts.edit(draft,brief.value);brief.onblur=()=>this.drafts.flush(draft.id).catch(()=>{});
    form.append(field('Task',brief),saveLine,start);
    form.onsubmit=e=>{e.preventDefault();this.start();};$('detail-body').append(form);brief.focus();
  }
  start(){return this.session.perform(()=>this.launch());}
  async launch(){const id=this.session.room.id;await this.drafts.flush(id);await this.options.flush(id);const missing=this.missing();if(missing.length)throw Error(missing.join('\n'));const run=await api(`/api/rooms/${id}/runs`,{});this.session.attach(run,{replay:false});this.session.confirmInOffice('worker','Task received.\nGetting ready to begin.');}
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
      const workflow=room.config.workflow==='direct'?'Direct':'Review',status=room.latest?.status||'idle';
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
      for(const run of runs){const link=button('',()=>this.session.perform(async()=>{const state=await api(`/api/runs/${run.id}`);this.session.window('history-run',`${room.name} / History`,`Run ${run.number}`,state.config.task);const progress=node('div'),reports=node('div'),tools=node('div');this.scene.activity.renderRecent(progress,null,12,state);this.session.renderReports(reports,state);this.session.renderToolLog(tools,state);$('detail-body').append(node('p',state.error||state.outcome||state.status,'run-summary'),progress,reports,tools);}));link.className='history-entry';link.setAttribute('aria-label',`Run ${run.number} · ${run.status}`);link.append(node('strong',`Run ${run.number} · ${run.status}`),node('small',run.task.split('\n')[0]));host.append(link);}
    }
    if(!rooms.length)host.append(node('p','Completed work will appear here.','empty-state'));
  }
  updateAttention(){
    const s=this.session,active=!!s.room&&terminal(s.taskRun),frame=this.scene.paused?0:Math.floor(this.scene.elapsed*3)%24;
    for(const marker of this.markers.values()){marker.ring.setVisible(false);marker.label.setVisible(false);}
    for(const id of ['board',...this.team.map(([id])=>id)]){
      let marker=this.markers.get(id);if(!marker){marker={ring:this.scene.add.image(0,0,'day:decision-ring:0').setVisible(false),label:this.scene.add.image(0,0,'day:decision-ring:0').setVisible(false)};this.markers.set(id,marker);}
      const b=this.binding(id),missing=id==='board'?!s.room?.brief?.trim():!this.hasModel(id),person=this.scene.people.get(id),visible=active&&missing&&(!person||!person.bubble&&!person.route.length)&&!this.scene.handoffs.active;
      marker.ring.setVisible(visible);marker.label.setVisible(visible&&id!=='board');if(!visible)continue;
      if(id==='board'){
        const key=`${this.scene.mood}:board-setup:${frame}`;if(!this.scene.textures.exists(key)){const c=document.createElement('canvas');c.width=BOARD.width+4;c.height=54;const x=c.getContext('2d');x.fillStyle=this.scene.mood==='night'?'#8194a160':'#7898aa90';const perimeter=[];for(let px=0;px<c.width;px++)perimeter.push([px,0]);for(let py=1;py<c.height;py++)perimeter.push([c.width-1,py]);for(let px=c.width-2;px>=0;px--)perimeter.push([px,c.height-1]);for(let py=c.height-2;py>0;py--)perimeter.push([0,py]);const start=Math.floor(frame/24*perimeter.length);for(let i=0;i<28;i++){const [px,py]=perimeter[(start+i)%perimeter.length];x.fillRect(px,py,1,1);}this.scene.textures.addCanvas(key,c);}marker.ring.setTexture(key).setOrigin(0).setPosition(BOARD.x-2,BOARD.y-2).setDepth(BOARD.y+BOARD.height+1);
      }else{
        marker.ring.setTexture(`${this.scene.mood}:decision-ring:${frame}`).setOrigin(.5).setPosition(Math.round(person.x),Math.round(person.y)-15).setDepth(Math.round(person.y)+2);
        const text='CHOOSE MODEL';const key=labelTexture(this.scene,text,{background:'idleBubble',color:'bubbleInk'});marker.label.setTexture(key).setOrigin(Math.floor(marker.label.width/2)/marker.label.width,1).setPosition(Math.round(person.x),Math.round(person.y)-40).setDepth(710);
      }
    }
  }
}
