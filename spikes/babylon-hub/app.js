import {B,v,setupGeometry,node,box,cylinder,material} from './geometry.js';
import {buildWorld} from './world.js';
import {buildCast,animateCharacter} from './characters.js';
import {navigate,move} from './navigation.js';
import {DemoProtocol,DemoSchedule} from './protocol.js';

const $=id=>document.getElementById(id),canvas=$('world');
const engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'low-power'},false);
engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio,1.5));
const scene=new B.Scene(engine);scene.clearColor=B.Color4.FromHexString('#e9e8dcff');
scene.ambientColor=new B.Color3(.12,.12,.12);
const camera=new B.ArcRotateCamera('composed Hub camera',-Math.PI/2+.23,1.08,12.8,v(-.25,1.4,.4),scene);
camera.fov=.65;camera.minZ=.1;camera.maxZ=70;camera.attachControl(canvas,true);
camera.lowerAlphaLimit=-Math.PI/2-.3;camera.upperAlphaLimit=-Math.PI/2+.6;
camera.lowerBetaLimit=.83;camera.upperBetaLimit=1.23;camera.lowerRadiusLimit=10.8;camera.upperRadiusLimit=15.5;
camera.wheelPrecision=55;camera.panningSensibility=0;
const fill=new B.HemisphericLight('quiet ambient',v(0,1,-.45),scene);fill.intensity=.72;fill.groundColor=B.Color3.FromHexString('#b6bbba');
const key=new B.DirectionalLight('warm window light',v(.65,-1,.3),scene);key.position=v(-4.8,8,-3.8);key.intensity=.35;key.diffuse=B.Color3.FromHexString('#fff0d9');
key.shadowMinZ=1;key.shadowMaxZ=24;key.autoCalcShadowZBounds=true;
const shadows=new B.ShadowGenerator(2048,key);shadows.usePercentageCloserFiltering=true;shadows.filteringQuality=B.ShadowGenerator.QUALITY_LOW;shadows.bias=.002;shadows.normalBias=.04;shadows.darkness=.18;
scene.imageProcessingConfiguration.exposure=1;scene.imageProcessingConfiguration.contrast=1;
setupGeometry(scene,shadows);
const world=buildWorld(scene),people=buildCast(world.stations);
for(const p of people.values()){p.destination=p.station;animateCharacter(p,.25,0);}
const card=node('physical protocol packet');
const cardMat=material('message paper','#fff0c5'),stampMat=material('message seal','#d69034');
box('message card',[.45,.59,.065],cardMat,card);
box('message edge',[.42,.018,.075],stampMat,card,v(0,-.23,0));
const seal=cylinder('message seal',.11,.025,stampMat,card,v(.12,-.1,-.045));seal.rotation.x=Math.PI/2;
for(let i=0;i<3;i++)box('message lines',[.24-i*.035,.014,.008],stampMat,card,v(-.035,.12-i*.065,-.038));
card.setEnabled(false);
let time=0,last=performance.now(),paused=matchMedia('(prefers-reduced-motion: reduce)').matches,selected='human',mode='work',packet=null,ambientNext=19,ambientIndex=0,disposed=false;
const log=[],descriptions={human:'Sculptural hair, generous hands, an uneven overshirt. Observes, listens, and brings the ensemble together.',implementer:'A pointed vermilion maker. Quick glances, restless hands, little pauses to check the result.',reviewer:'A broad teal presence. Reads carefully, moves slowly, and takes a considered second look.'};
const protocol=new DemoProtocol(event=>handleEvent(event)),schedule=new DemoSchedule(protocol);
function record(text) {log.push(text);$('events').replaceChildren(...log.slice(-5).map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));}
function returnToWork(p,phase='work') {
  // Semantic change happens now, even if the cosmetic return walk is unfinished.
  p.phase=phase;p.ambient=null;p.ambientUntil=null;p.clock=0;
  if(B.Vector3.Distance(p.root.position,p.station.working)>.035)navigate(p,p.station,world,people);
  else {p.route=[];p.destination=p.station;}
}
function handleEvent(e) {
  if(e.type==='work') {
    mode='work';people.forEach(p=>returnToWork(p));$('decision').hidden=true;record('Crew resumes local work');
  }else if(e.type==='quiet') {
    mode='quiet';people.forEach(p=>{p.phase='waiting';});ambientNext=time+1;$('decision').hidden=true;record('Quiet moment · ambient life');
  }else if(e.type==='attention') {
    returnToWork(people.get('human'),'attention');$('decision').hidden=false;record('Human input requested');
  }else if(e.type==='send') {
    const from=people.get('implementer').root.position;
    packet={id:e.id,started:time,delivered:false,start:from.add(v(.3,1.46,-.4)),end:v(2.95,1.2,-.9)};
    card.setEnabled(true);$('receive').disabled=false;$('send').disabled=true;record(`${e.seq} · SEND · Implementer → Reviewer · Proposal`);
  }else if(e.type==='receive') {
    returnToWork(people.get('reviewer'),'reviewing');$('receive').disabled=true;$('send').disabled=false;record(`${e.seq} · RECEIVE · Reviewer · Proposal`);
    if(packet?.id===e.id)packet.receivedAt=time;
  }else if(e.type==='decision') {
    $('decision').hidden=true;returnToWork(people.get('human'),e.choice==='Another round'?'work':'waiting');record(`Human chose “${e.choice}” · demo only`);
  }
  if(paused)people.forEach(p=>animateCharacter(p,.25,time));
}
function choose(id) {
  selected=id;document.querySelectorAll('[data-person]').forEach(el=>el.classList.toggle('selected',el.dataset.person===id));
  $('selected-name').textContent=id[0].toUpperCase()+id.slice(1);$('selected-description').textContent=descriptions[id];
}
function takeBreak(p,action) {
  if([...people.values()].some(o=>o!==p&&(o.ambient||o.route.length)))return false;
  const station=world.stations[action];
  if(!navigate(p,station,world,people))return false;
  p.ambient=action;p.ambientUntil=null;p.phase='waiting';return true;
}
function ambientStep() {
  for(const p of people.values())if(p.ambient&&!p.route.length) {
    p.ambientUntil??=time+5.5;
    if(time>=p.ambientUntil){returnToWork(p,mode==='quiet'?'waiting':'work');ambientNext=time+8;}
  }
  if(mode==='quiet'&&time>=ambientNext) {
    const ids=['human','reviewer','implementer'],id=ids[ambientIndex%3],action=['window','coffee','inspect'][ambientIndex%3];
    if(takeBreak(people.get(id),action)){ambientIndex++;ambientNext=time+18;}else ambientNext=time+2;
  }
}
function project(element,position,dx=0,dy=0) {
  const width=canvas.clientWidth,height=canvas.clientHeight;
  const point=B.Vector3.Project(position,B.Matrix.Identity(),scene.getTransformMatrix(),camera.viewport.toGlobal(width,height));
  element.style.transform=`translate(${point.x+dx}px,${point.y+dy}px)`;
}
function updatePacket() {
  if(!packet){$('packet-label').hidden=true;$('arrival').hidden=true;return;}
  const elapsed=time-packet.started,q=Math.min(1,elapsed/3.2),u=q*q*(3-2*q);
  const pos=B.Vector3.Lerp(packet.start,packet.end,u);pos.y+=Math.sin(q*Math.PI)*.6;card.position.copyFrom(pos);
  card.rotation.set(.04,Math.sin(q*Math.PI)*.5,-.12+q*.15);
  if(q===1&&!packet.delivered){packet.delivered=true;record('Visual arrival · runtime receipt unchanged');}
  const received=protocol.messages.get(packet.id)?.receiveSeq!=null;
  if(received&&time-packet.receivedAt>.9){card.setEnabled(false);$('packet-label').hidden=true;$('arrival').hidden=true;return;}
  card.setEnabled(true);card.scaling.setAll(received?Math.max(.05,1-(time-packet.receivedAt)/.9):1);
  $('packet-label').hidden=q===1;$('arrival').hidden=q<1||received;
  project($('packet-label'),pos,22,-48);project($('arrival'),pos,-40,-63);
}
function step(dt) {
  time+=dt;schedule.step(time);ambientStep();
  for(const p of people.values()){move(p,dt,world,people);animateCharacter(p,dt,time);}
  updatePacket();
}
function frame(now) {
  if(disposed)return;
  const dt=paused||document.hidden?0:Math.min(.1,(now-last)/1000);last=now;
  if(dt)step(dt);else updatePacket();
  const impl=people.get('implementer');$('activity').hidden=impl.phase!=='work'||!!impl.ambient||impl.route.length>0;
  // Project after rendering so the camera matrix is current, including user orbit.
  scene.render();project($('activity'),impl.root.position.add(v(.25,impl.height+.15,0)),-40,-90);
  $('scene-status').textContent=paused?'Motion paused':mode==='quiet'?'A quiet moment · the room stays alive':people.get('human').phase==='attention'?'The Human is listening':'Local work · shared momentum';
}
// Cap presentation at 30 fps. No timers or frame completion gate semantic input.
let previousRender=0;engine.runRenderLoop(()=>{const now=performance.now();if(document.hidden)return;if(now-previousRender<32)return;previousRender=now;frame(now);});
const resize=new ResizeObserver(()=>engine.resize());resize.observe(canvas);
scene.executeWhenReady(()=>{$('loading').hidden=true;window.hub.ready=true;});
document.querySelectorAll('[data-person]').forEach(el=>el.onclick=()=>choose(el.dataset.person));
scene.onPointerObservable.add(info=>{if(info.type===B.PointerEventTypes.POINTERPICK){const id=info.pickInfo?.pickedMesh?.metadata?.person;if(id)choose(id);}});
function manual(type,payload={}) {schedule.manual=true;return protocol.emit(type,payload);}
for(const type of ['work','quiet','send','attention'])$(type).onclick=()=>manual(type);
$('receive').onclick=()=>manual('receive',{id:[...protocol.messages.keys()].at(-1)});
$('walk').onclick=()=>{schedule.manual=true;const p=people.get(selected);takeBreak(p,{human:'window',implementer:'inspect',reviewer:'coffee'}[selected]);};
$('camera').onclick=()=>{camera.alpha=-Math.PI/2+.23;camera.beta=1.08;camera.radius=12.8;camera.target.copyFrom(v(-.25,1.4,.4));};
function setPaused(value){paused=value;last=performance.now();$('pause').textContent=paused?'Resume motion':'Pause motion';$('pause').setAttribute('aria-pressed',String(paused));}
$('pause').onclick=()=>setPaused(!paused);setPaused(paused);
document.querySelectorAll('[data-decision]').forEach(el=>el.onclick=()=>manual('decision',{choice:el.dataset.decision}));
window.hub={ready:false,scene,engine,camera,shadows,people,world,protocol,schedule,card,
  // Deterministic inspection uses exactly the same movement/animation update as
  // the live render loop. It never creates semantic receive events by rendering.
  step,
  emit:manual,takeBreak:(id,action)=>{schedule.manual=true;return takeBreak(people.get(id),action);},setPaused,
  inspect:()=>({time,mode,paused,selected,triangles:scene.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),meshes:scene.meshes.length,messages:[...protocol.messages.values()],packet:packet?{id:packet.id,delivered:packet.delivered}:null,participants:[...people.values()].map(p=>({id:p.id,phase:p.phase,pose:p.pose,ambient:p.ambient,position:p.root.position.asArray(),route:p.route.length,radius:p.radius,head:p.head.rotation.asArray(),hands:p.handTargets.map(h=>h.asArray())}))}),
  dispose:()=>{disposed=true;resize.disconnect();engine.stopRenderLoop();scene.dispose();engine.dispose();}
};
window.addEventListener('pagehide',()=>window.hub.dispose(),{once:true});
