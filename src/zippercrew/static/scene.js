import { project, architecture, environmentEntities, desk, chair, shadow } from '/world.js';

// A deliberately small scene graph: entities have identity, floor coordinates,
// render assets and optional selection. The process supplies roles and stations.
export const PROCESS = {
  id: 'pair_programming', name: 'Pair Programming',
  roles: [
    { name:'Implementer', kind:'agent', color:'#bd7054', shade:'#915039', mat:'#ab7058',
      station:{x:170,y:340}, rest:{x:95,y:430}, labelOffset:{x:-141,y:7}, access:'Write access',
      description:'Makes the change, tests it, and responds to the review.' },
    { name:'Reviewer', kind:'agent', color:'#397e77', shade:'#285e59', mat:'#609189',
      station:{x:484,y:233}, rest:{x:562,y:185}, labelOffset:{x:153,y:-5}, access:'Read-only access',
      description:'Inspects the actual repository and challenges the proposal.' },
    { name:'Human', kind:'human', color:'#8b6b9f', shade:'#654d78', mat:'#9b87a3',
      station:{x:430,y:486}, rest:{x:355,y:481}, labelOffset:{x:0,y:84}, access:'Process decisions',
      description:'Your place in the conversation.' },
  ],
  links:[['Human','Implementer'],['Human','Reviewer'],['Implementer','Reviewer'],['Implementer','Human'],['Reviewer','Human']],
  sequence:['Human','Implementer','Reviewer','Human'],
};
for(const role of PROCESS.roles) {
  role.seat={x:role.station.x-76,y:role.station.y-5};
  role.reading={x:role.seat.x-15,y:role.seat.y+15};
}
const SVG='http://www.w3.org/2000/svg';
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const states = {
  unconfigured:{label:'Choose agent',pose:'absent'}, ready:{label:'Ready',pose:'seated'},
  working:{label:'Working',pose:'typing'}, reviewing:{label:'Reviewing',pose:'reading'},
  waiting:{label:'Waiting',pose:'coffee'}, 'needs human':{label:'Your turn',pose:'attention'},
  completed:{label:'Completed',pose:'coffee'}, failed:{label:'Failed',pose:'stopped'}, stopped:{label:'Stopped',pose:'stopped'},
};
const entities = new Map();
let lastMessage=0, root, onSelect;

function character(role) {
  const skin=role.name==='Reviewer'?'#be8b69':role.name==='Human'?'#d6a483':'#e4b58d';
  const hair=role.name==='Reviewer'?'#293e37':role.name==='Human'?'#5b454b':'#594539';
  return `<g class="character">
    <ellipse class="contact-shadow" cy="0" rx="29" ry="11" fill="#364b40" opacity=".16"/>
    <g class="body-pose">
      <g class="seated-legs"><path class="legs" d="M-10-39-8-12 7-3M10-36 20-19 30-15" fill="none" stroke="#3f4f48" stroke-width="13" stroke-linecap="round"/>
      <path d="m1-3 14 2m10-14 14 3" stroke="#e9ddc4" stroke-width="8" stroke-linecap="round"/></g><g class="standing-legs"><path d="M-15-40-17 2m31-40 8 45" stroke="#3f4f48" stroke-width="13" stroke-linecap="round"/><path d="m-19 5 16 4m24 1 17 4" stroke="#eee1c5" stroke-width="8" stroke-linecap="round"/></g>
      <path d="M-18-99Q-36-96-34-75l9 37q24 13 49-2l-5-42Q17-100-1-103Z" fill="${role.color}"/>
      <path d="M-29-84-25-44q8 6 18 6l-3-54Z" fill="${role.shade}" opacity=".6"/>
      <path d="M-7-103v-11h14v14l-5 8Z" fill="${skin}"/>
      <g class="head">
        <path d="M-24-139q2-28 29-24 27 4 25 28l-3 18q-4 17-19 15l-16-7q-13-7-16-30Z" fill="${skin}"/>
        <path d="M-24-141q-5-25 14-29 20-10 36 8 11 11 3 28l-8-12q-16 0-23-14-1 21-17 21l-2 13Z" fill="${hair}"/>
        ${role.name==='Implementer'?`<path d="m-9-164-9-8m18 6 3-10" stroke="${hair}" stroke-width="7" stroke-linecap="round"/>`:''}
        ${role.name==='Human'?`<ellipse cx="-23" cy="-147" rx="12" ry="14" fill="${hair}"/>`:''}
        <ellipse cx="-15" cy="-127" rx="5" ry="7" fill="${skin}"/>
        <path d="M6-132v3m15 2v3" stroke="#463b32" stroke-width="2.7" stroke-linecap="round"/>
        <path d="m13-119 6 1" stroke="#975c48" stroke-width="1.8" stroke-linecap="round"/>
        ${role.name==='Reviewer'?'<path d="m0-136 12 3v9l-12-3Zm16 5 12 3v9l-12-3m-4-1 4 1" fill="none" stroke="#324f47" stroke-width="2.2"/>':''}
      </g>
      <g class="work-arms"><path d="M-24-83-18-63 15-59m-1-27 15 18 13 1" fill="none" stroke="${role.color}" stroke-width="14" stroke-linecap="round"/><path class="hands" d="m15-59 11 4m15-23 9 3" stroke="${skin}" stroke-width="9" stroke-linecap="round"/></g>
      <g class="reading-arms"><path d="M-24-83-10-68 15-84m0-2 10 9 19-4" fill="none" stroke="${role.color}" stroke-width="13" stroke-linecap="round"/><path d="m12-108 36 11-5 43-36-12Z" fill="#fff9e5" stroke="#dbd8be"/><path d="m18-97 23 7m-24 1 23 7m-24 1 17 5" stroke="#79a69a" stroke-width="2"/><path d="m9-68 7-4m27-10 6 2" stroke="${skin}" stroke-width="8" stroke-linecap="round"/><path class="pencil" d="m34-73 15-19" stroke="#b2764f" stroke-width="3"/></g>
      <g class="coffee-arms"><path d="M-25-83-29-58-15-41m28-45 15 16-9 9" fill="none" stroke="${role.color}" stroke-width="13" stroke-linecap="round"/><path d="m-15-41 3 7m31-95-5 0" stroke="${skin}" stroke-width="9" stroke-linecap="round"/><g class="held-cup" transform="translate(18 -69)"><path d="M-10-12h20V3Q0 10-10 3Z" fill="#fff4dd"/><ellipse cy="-12" rx="10" ry="4" fill="#6e4d38"/><path d="M10-9q13 0 8 10h-8" fill="none" stroke="#fff4dd" stroke-width="3"/></g></g>
    </g>
    <g class="attention-cue"><circle cx="15" cy="-194" r="16" fill="${role.color}"/><path d="M15-202v9m0 5v1" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>
    <g class="success-cue"><circle cx="26" cy="-175" r="10" fill="#f0f6df"/><path d="m21-175 4 4 7-8" fill="none" stroke="#47745a" stroke-width="2"/></g>
  </g>`;
}
function register(entity, markup) {
  const node=document.createElementNS(SVG,'g');
  node.id=entity.id; node.dataset.entity=entity.kind;
  if(entity.select) {
    node.classList.add('interactive'); node.setAttribute('role','button'); node.setAttribute('tabindex','0');
    node.setAttribute('aria-label',entity.label || entity.select);
    const select=()=>onSelect(entity.select);
    node.addEventListener('click',select);
    node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}});
  }
  node.innerHTML=markup;
  const item={...entity,node}; entities.set(entity.id,item); return item;
}
function sortEntities() {
  const layer=document.getElementById('world-entities');
  const focused=document.activeElement;
  [...entities.values()].sort((a,b)=>(a.depth??a.x+a.y)-(b.depth??b.x+b.y)).forEach((entity,index)=>{
    if(layer.children[index]!==entity.node)layer.insertBefore(entity.node,layer.children[index]||null);
  });
  if(root?.contains(focused)&&document.activeElement!==focused)focused.focus({preventScroll:true});
}
export function createScene(container, select) {
  onSelect=select; entities.clear();
  container.innerHTML=`<svg id="room-art" viewBox="85 0 1240 900" xmlns="${SVG}" aria-label="A 2.5D café workspace with Human, Implementer, and Reviewer">
    ${architecture()}<g id="process-routes" aria-hidden="true"></g><g id="world-entities"></g>
    <g id="message-paths" aria-hidden="true"></g><g id="message-tokens" aria-hidden="true"></g><g id="station-labels"></g>
  </svg>`;
  root=document.getElementById('room-art');
  for(const entity of environmentEntities) register(entity,entity.render());
  for(const role of PROCESS.roles) {
    register({id:`chair-${role.name}`,kind:'furniture',...role.seat,depth:role.seat.x+role.seat.y-3},chair(role));
    register({id:`desk-${role.name}`,kind:'station',...role.station,select:role.name,label:`${role.name} workstation`},desk(role));
    const p=project(role.seat.x,role.seat.y);
    register({id:`actor-${role.name}`,kind:'participant',role:role.name,...role.seat,select:role.name},`<g class="actor-position" transform="translate(${p.x} ${p.y})">${character(role)}<g class="vacancy"><circle cy="-118" r="22" fill="#f7f5e4" stroke="${role.color}" stroke-width="2" stroke-dasharray="3 4"/><path d="M-8-118H8M0-126v16" stroke="${role.color}" stroke-width="2"/></g><ellipse class="selection-ring" cy="0" rx="41" ry="18" fill="none" stroke="${role.color}" stroke-width="2.5"/></g>`);
    // Labels are anchored to the station, independent of a participant's pose/position.
    const label=project(role.station.x,role.station.y);
    label.x+=role.labelOffset.x;label.y+=role.labelOffset.y;
    const node=document.createElementNS(SVG,'g');
    node.id=`label-${role.name}`; node.classList.add('station-label','interactive');
    node.setAttribute('transform',`translate(${label.x} ${label.y})`);
    node.setAttribute('role','button'); node.setAttribute('tabindex','0');
    node.setAttribute('aria-label',`${role.name}: choose agent`);
    node.innerHTML=`<path d="M0-24v13" stroke="${role.color}" stroke-width="2" opacity=".65"/><rect x="-86" y="-7" width="172" height="51" rx="12" fill="#f8f6ed" fill-opacity=".95"/><circle cx="-69" cy="9" r="4" fill="${role.color}"/><text x="-58" y="14" class="role-name">${role.name}</text><text x="0" y="33" text-anchor="middle" class="station-state">Choose agent +</text>`;
    node.addEventListener('click',()=>select(role.name));
    node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(role.name);}});
    document.getElementById('station-labels').append(node);
  }
  sortEntities();
  const routes=PROCESS.links.map(([a,b])=>{
    const from=PROCESS.roles.find(r=>r.name===a).station,to=PROCESS.roles.find(r=>r.name===b).station;
    const p=project(from.x,from.y),q=project(to.x,to.y);
    return `<path d="M${p.x},${p.y}Q${(p.x+q.x)/2},${Math.min(p.y,q.y)-45} ${q.x},${q.y}"/>`;
  }).join('');
  document.getElementById('process-routes').innerHTML=routes;
}
function boardText(task) {
  const text=task.trim().replace(/\s+/g,' ');
  if(!text) return ['What are we','working on?'];
  const split=text.length>23?(Math.max(text.lastIndexOf(' ',23),0)||23):text.length;
  const rest=text.slice(split).trim();
  return [text.slice(0,split),rest.slice(0,23)+(rest.length>23?'…':'')];
}
export function paintScene({states:runtimeStates,bindings,task,workspace,selected}) {
  for(const role of PROCESS.roles) {
    const entity=entities.get(`actor-${role.name}`);
    const binding=bindings[role.name];
    const bound=role.kind==='human'||!!binding?.profile;
    const state=bound?runtimeStates[role.name]:'unconfigured';
    const visual=states[state]||states.ready;
    const atCoffee=visual.pose==='coffee'&&role.kind!=='human';
    const position=atCoffee?role.rest:visual.pose==='reading'?role.reading:role.seat;
    entity.state=state; entity.profile=binding?.profile||null; entity.x=position.x;entity.y=position.y;
    entity.node.setAttribute('class',`interactive participant ${role.name.toLowerCase()} ${bound?'bound':'empty'} ${state.replaceAll(' ','-')}`);
    entity.node.dataset.state=state; entity.node.dataset.pose=visual.pose;
    entity.node.dataset.x=position.x; entity.node.dataset.y=position.y;
    entity.node.setAttribute('aria-label',`${role.name}: ${visual.label}. Inspect participant`);
    entity.node.setAttribute('aria-pressed',String(selected===role.name));
    // CSS interpolates this real state change; it cannot advance the process.
    const p=project(position.x,position.y);
    const mover=entity.node.querySelector('.actor-position');
    mover.style.transform=`translate(${p.x}px, ${p.y}px)`;
    mover.removeAttribute('transform');
    const station=entities.get(`desk-${role.name}`).node;
    station.setAttribute('class',`interactive workstation ${state.replaceAll(' ','-')}`);
    station.setAttribute('aria-pressed',String(selected===role.name));
    station.dataset.state=state;
    const label=document.getElementById(`label-${role.name}`);
    label.querySelector('.station-state').textContent=visual.label+(bound?'':' +');
    label.setAttribute('aria-label',`${role.name}: ${visual.label}`);
    label.classList.toggle('selected',selected===role.name);
    entity.node.querySelector('.selection-ring').classList.toggle('visible',selected===role.name);
  }
  root.classList.toggle('human-turn',runtimeStates.Human==='needs human');
  root.classList.toggle('show-routes',selected==='process');
  const [first,second]=boardText(task);
  document.getElementById('board-task').textContent=first;
  document.getElementById('board-task-second').textContent=second;
  const name=workspace.split('/').filter(Boolean).at(-1)||workspace;
  document.getElementById('board-workspace').textContent=(name||'Choose a repository').slice(0,25);
  sortEntities();
}
export function showMessage(message,{replay=false}={}) {
  if(!message||message.id<=lastMessage)return;
  lastMessage=message.id;
  const from=PROCESS.roles.find(r=>r.name===message.from),to=PROCESS.roles.find(r=>r.name===message.to);
  if(!from||!to||replay||!PROCESS.links.some(([a,b])=>a===from.name&&b===to.name))return;
  const start=project(from.station.x,from.station.y,103),end=project(to.station.x,to.station.y,103);
  const path=`M${start.x},${start.y}Q${(start.x+end.x)/2},${Math.min(start.y,end.y)-80} ${end.x},${end.y}`;
  const line=document.createElementNS(SVG,'path');
  line.setAttribute('d',path);line.setAttribute('class','message-line');line.setAttribute('stroke',from.color);
  line.dataset.from=from.name;line.dataset.to=to.name;line.dataset.messageId=message.id;
  const paths=document.getElementById('message-paths'),tokens=document.getElementById('message-tokens');
  if(reducedMotion()){paths.replaceChildren();tokens.replaceChildren();}
  for(const arrived of tokens.querySelectorAll('[data-arrived]')) {
    paths.querySelector(`[data-message-id="${arrived.dataset.messageId}"]`)?.remove();
    arrived.remove();
  }
  paths.append(line);
  const token=document.createElementNS(SVG,'g');token.setAttribute('class','message-token');
  token.dataset.messageId=message.id;
  token.innerHTML=`<ellipse cy="12" rx="17" ry="5" fill="#384b3a" opacity=".15"/><path d="m-14-17 26 6v30l-26-6Z" fill="#fff8e6" stroke="${from.color}" stroke-width="2"/><path d="m-8-8 14 4m-14 3 14 4m-14 3 9 3" stroke="${from.color}" stroke-width="2"/>`;
  if(reducedMotion())token.setAttribute('transform',`translate(${end.x} ${end.y})`);
  else {
    const motion=document.createElementNS(SVG,'animateMotion');
    motion.setAttribute('path',path);motion.setAttribute('dur','1.3s');motion.setAttribute('fill','freeze');token.append(motion);
  }
  tokens.append(token);
  // Concurrent semantic sends get separate tokens; a fast follow-up cannot erase
  // the proposal before it reaches Reviewer. Retain only the latest arrival.
  const motion=token.querySelector('animateMotion');
  motion?.addEventListener('endEvent',()=>{
    token.dataset.arrived='true';
    if(message.id!==lastMessage){token.remove();line.remove();}
  },{once:true});
  while(tokens.children.length>6){tokens.firstElementChild.remove();paths.firstElementChild.remove();}
  motion?.beginElement();
}
export function resetMessages() {
  lastMessage=0;
  document.getElementById('message-paths').replaceChildren();
  document.getElementById('message-tokens').replaceChildren();
}
