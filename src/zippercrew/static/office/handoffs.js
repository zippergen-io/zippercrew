import { labelTexture } from './art.js';
import { PALETTES } from './palettes.js';

const actors={Implementer:'worker',Reviewer:'reviewer',Human:'human',Planner:'planner'};
const terminal=run=>['completed','failed','stopped'].includes(run.status);
const face=(person,target)=>{
  const dx=target.x-person.x,dy=target.y-person.y;
  person.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  person.motion.face(person.direction);
};

// A read-only presentation of actual protocol envelopes. Walking never sends,
// receives, approves or delays a backend message. One courier at a time keeps
// the office calm; receipt is acknowledged only when the backend reports it.
export class OfficeHandoffs {
  constructor(scene){
    this.scene=scene;this.seen=new Set();this.queue=[];this.active=null;
    this.runId=null;this.clock=0;this.cooldown=0;this.lastSpeech=new Map();
    this.receipts=new Map();this.completed=[];
    this.note=scene.add.image(0,0,this.noteKey('worker')).setOrigin(0).setDepth(780).setVisible(false);
    this.caption=scene.add.image(0,0,labelTexture(scene,'NOTE',{color:'bubbleInk',background:'bubble'})).setOrigin(0).setDepth(781).setVisible(false);
  }
  noteKey(sender){
    const key=`${this.scene.mood}:handoff-note:${sender}`;
    if(this.scene.textures.exists(key))return key;
    const canvas=document.createElement('canvas');canvas.width=13;canvas.height=15;
    const c=canvas.getContext('2d'),night=this.scene.mood==='night';c.imageSmoothingEnabled=false;
    const r=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
    r(2,2,11,13,'#473a312e');r(0,0,10,13,night?'#a9a397':'#6e6258');
    r(1,1,8,11,night?'#ded5bd':'#f7f0dc');r(7,0,3,3,night?'#b1ad9e':'#d6c8ac');
    r(2,3,3,2,PALETTES[this.scene.mood][sender]);
    r(2,7,5,1,'#8c9393');r(2,9,4,1,'#a9aaa0');
    this.scene.textures.addCanvas(key,canvas);return key;
  }
  speak(id,text,{force=false,duration=3.5}={}){
    if(!this.scene.people.has(id)||this.scene.worldTime<(this.scene.reactionUntil||0))return;
    if(!force&&(this.active||this.clock-(this.lastSpeech.get(id)??-100)<7))return;
    // Keep only one speech bubble during an exchange, plus the carried card.
    for(const p of this.scene.people.values())if(p.id!==id){p.bubble?.destroy();p.bubble=null;}
    this.lastSpeech.set(id,this.clock);this.scene.say(id,text,duration,'conversation');
  }
  reset(){
    this.cancel();this.seen.clear();this.receipts.clear();this.runId=null;this.completed=[];
    this.lastSpeech.clear();
  }
  cancel(){
    const trip=this.active;this.queue=[];this.active=null;this.reducedReceipt=null;this.note.setVisible(false);this.caption.setVisible(false);
    this.scene.conversation=null;this.scene.talkDots?.setVisible(false);
    if(trip){this.home(trip.sender);if(trip.recipientChair)this.home(trip.recipient);}
    for(const person of this.scene.people.values()){
      person.exchangeStatus=null;if(!(person.reactionUntil>this.scene.worldTime)){person.bubble?.destroy();person.bubble=null;}
    }
  }
  observe(run,{replay=false}={}){
    if(this.runId!==run.id){this.reset();this.runId=run.id;}
    if(replay){this.cancel();for(const m of run.messages||[])this.seen.add(m.id);return;}
    for(const m of run.messages||[]){
      this.receipts.set(m.id,m);
      if(!m.send_id||this.seen.has(m.id))continue;
      this.seen.add(m.id);
      const sender=actors[m.from],recipient=actors[m.to];
      if(m.control||!sender||!recipient||sender===recipient||!this.scene.people.has(sender)||!this.scene.people.has(recipient))continue;
      if(sender==='human'){
        this.speak('human',`${m.label==='Guidance'?'GUIDANCE':'NOTE'} SENT.`);
        continue; // User movement always belongs to the user.
      }
      const label=['Proposal','Review','Guidance','Task'].includes(m.label)?m.label:'Note';
      this.queue.push({...m,label,sender,recipient,queued:this.clock});
    }
    // A stopped or failed task must not keep acting busy. Completion allows the
    // current, already-observed handoff to finish, but drops any backlog.
    if(['stopped','failed','paused'].includes(run.status)){this.cancel();return;}
    if(terminal(run)){
      this.queue=[];
      if(!this.active)for(const p of this.scene.people.values())if(!(p.reactionUntil>this.scene.worldTime)){p.bubble?.destroy();p.bubble=null;}
      return;
    }
    this.queue=this.queue.slice(-4);
  }
  status(run,previous){
    if(this.active||this.queue.length)return;
    if(run.pending&&run.pending.id!==previous?.pending?.id){this.speak('human','YOUR DECISION.');return;}
    for(const [role,id]of Object.entries(actors)){
      const state=run.participants[role];
      if(state===previous?.participants[role])continue;
      if(state==='working')this.speak(id,'WORKING ON THE TASK.');
      else if(state==='reviewing')this.speak(id,'CHECKING THE CHANGES.');
    }
  }
  target(sender,recipient){
    const occupied=[...this.scene.people.values()].filter(p=>p!==sender);
    const sideEntry=recipient.seated&&this.scene.seating.chairs.get(recipient.seated).seat.approaches;
    // Leave room beside a desk chair for its occupant to step out and greet
    // the courier. Standing on the entry point would force the far-side exit.
    const offsets=sideEntry?[[40,12],[-40,12],[0,36]]:[[28,4],[-28,4],[0,28],[0,-28],[36,16],[-36,16]];
    const candidates=offsets
      .map(([x,y])=>({x:Math.round(recipient.x+x),y:Math.round(recipient.y+y)}))
      .filter(point=>this.scene.nav.free(point.x,point.y)&&occupied.every(p=>Math.hypot(point.x-p.x,point.y-p.y)>=16));
    candidates.sort((a,b)=>Math.hypot(a.x-sender.x,a.y-sender.y)-Math.hypot(b.x-sender.x,b.y-sender.y));
    const starts=sender.seated?this.scene.seating.points(this.scene.seating.chairs.get(sender.seated)).approaches:[sender];
    return candidates.find(point=>starts.some(start=>this.scene.nav.route(start,point,occupied).length));
  }
  start(message){
    this.scene.ambient?.cancel();
    const sender=this.scene.people.get(message.sender),recipient=this.scene.people.get(message.recipient);
    const target=this.target(sender,recipient);
    if(!target)return false;
    const trip={...message,phase:'walking',started:this.clock,lastRoute:this.clock,target};
    this.active=trip;
    sender.exchangeStatus=`Bringing ${message.label.toLowerCase()} to ${recipient.name}`;
    this.scene.moveTo(sender.id,target,{status:sender.exchangeStatus,onArrival:()=>this.arrive(trip)});
    this.speak(sender.id,`${message.label.toUpperCase()} FOR ${recipient.name.toUpperCase()}.`,{force:true});
    this.paint(trip);
    this.scene.ui.updatePerson();
    return true;
  }
  arrive(trip){
    if(this.active!==trip)return;
    const sender=this.scene.people.get(trip.sender),recipient=this.scene.people.get(trip.recipient);
    if(Math.hypot(sender.x-recipient.x,sender.y-recipient.y)>48){trip.lastRoute=0;return;}
    trip.phase='offered';trip.arrived=this.clock;
    face(sender,recipient);
    if(recipient.id!=='human'&&recipient.seated&&!recipient.transition){
      trip.recipientChair=recipient.seated;trip.phase='greeting';
      this.scene.seating.stand(recipient,()=>{
        if(this.active!==trip)return;
        face(recipient,sender);trip.phase='offered';trip.arrived=this.clock;
        this.acknowledge(trip);
      },sender);
    }
    if(!recipient.seated&&!recipient.route.length&&!recipient.transition)face(recipient,sender);
    this.scene.conversation={a:sender.id,b:recipient.id};
    if(trip.phase==='offered')this.acknowledge(trip);
  }
  acknowledge(trip){
    const message=this.receipts.get(trip.id);
    if(!message?.receive_id||trip.acknowledged)return;
    trip.acknowledged=true;trip.transferStarted=this.clock;trip.phase='transferring';
    trip.noteOwner=trip.sender;
  }
  receive(trip){
    trip.noteOwner=trip.recipient;trip.phase='received';trip.receiptTime=this.clock;
    // Leave the document in the recipient's hand while the empty-handed sender
    // returns to work. Clearing the shared pose preserves the receipt bubble.
    this.scene.conversation=null;this.scene.talkDots.setVisible(false);
    this.home(trip.sender);
    this.scene.people.get(trip.sender).exchangeStatus='Handover complete';
    const recipient=this.scene.people.get(trip.recipient);
    recipient.exchangeStatus=`Received ${trip.label.toLowerCase()} from ${this.scene.people.get(trip.sender).name}`;
    this.speak(trip.recipient,`${trip.label.toUpperCase()} RECEIVED.`,{force:true,duration:3});
    this.completed.push({id:trip.id,from:trip.sender,to:trip.recipient,received:true});
    this.completed=this.completed.slice(-20);this.scene.ui.updatePerson();
  }
  home(id){
    const p=this.scene.people.get(id);if(!p||id==='human')return;
    p.onArrival=null;p.route=[];this.scene.seating.cancelApproach(p);
    // A canceled stand must not invoke the old courier callback on completion.
    if(p.transition?.kind==='stand')p.transition.after=null;
    if(p.seated&&!p.transition)return;
    const go=()=>this.scene.requestSit(id,p.chairId,'Returning to the desk');
    if(p.transition?.kind==='stand')p.transition.after=go;
    else go();
  }
  finish(){
    const trip=this.active;if(!trip)return;
    this.active=null;this.cooldown=1.5;this.note.setVisible(false);this.caption.setVisible(false);
    this.scene.conversation=null;this.scene.talkDots.setVisible(false);
    for(const id of [trip.sender,trip.recipient])this.scene.people.get(id).exchangeStatus=null;
    this.home(trip.sender);
    if(trip.recipientChair)this.home(trip.recipient);
    this.scene.ui.updatePerson();
    const run=this.scene.session?.run;
    if(run?.participants.Implementer==='waiting'&&run.participants.Reviewer==='reviewing')
      this.speak('worker','WAITING FOR REVIEW.');
  }
  paint(trip){
    const hand=id=>{const p=this.scene.people.get(id);return {x:Math.round(p.x)+(p.direction==='left'?-17:9),y:Math.round(p.y)-24};};
    const sender=this.scene.people.get(trip.sender),from=hand(trip.sender),to=hand(trip.recipient);
    let position=trip.noteOwner===trip.recipient?to:from;
    if(trip.phase==='transferring'){
      const t=Math.min(1,(this.clock-trip.transferStarted)/.45);
      position={x:Math.round(from.x+(to.x-from.x)*t),y:Math.round(from.y+(to.y-from.y)*t-Math.sin(t*Math.PI)*3)};
    }
    this.note.setTexture(this.noteKey(trip.sender)).setPosition(position.x,position.y).setVisible(true);
    const p=sender;
    const title=['Proposal','Review','Guidance','Task'].includes(trip.label)?trip.label.toUpperCase():'NOTE';
    this.caption.setTexture(labelTexture(this.scene,title,{color:'bubbleInk',background:'bubble',accent:trip.sender}));
    this.caption.setPosition(Math.round(p.x-this.caption.width/2),Math.round(p.y)+17)
      .setVisible(trip.phase==='walking'&&!p.bubble);
  }
  update(dt){
    this.clock+=dt;this.cooldown=Math.max(0,this.cooldown-dt);
    if(this.scene.worldTime<(this.scene.reactionUntil||0))return;
    if(this.scene.paused){
      if(this.active)this.finish();
      // Reduced motion uses the same envelopes without moving anybody.
      if(this.queue.length&&!this.cooldown){
        const message=this.queue.shift(),recipient=this.scene.people.get(message.recipient);
        this.speak(message.sender,`${message.label.toUpperCase()} TO ${recipient.name.toUpperCase()}.`,{force:true});
        this.reducedReceipt={...message,at:this.clock+2};this.cooldown=5;
      }
    }else if(!this.active&&!this.cooldown&&this.queue.length){
      const message=this.queue.shift();
      if(this.clock-message.queued<30&&!this.start(message))this.cooldown=1;
    }
    if(this.reducedReceipt&&this.clock>=this.reducedReceipt.at){
      const message=this.reducedReceipt;this.reducedReceipt=null;
      if(this.receipts.get(message.id)?.receive_id)this.speak(message.recipient,`${message.label.toUpperCase()} RECEIVED.`,{force:true});
    }
    const trip=this.active;if(!trip)return;
    const sender=this.scene.people.get(trip.sender),recipient=this.scene.people.get(trip.recipient);
    if(trip.phase==='walking'){
      if(this.clock-trip.started>18){this.finish();return;}
      if(this.clock-trip.lastRoute>1.5&&(!sender.route.length&&!sender.transition||Math.hypot(trip.target.x-recipient.x,trip.target.y-recipient.y)>44)){
        const target=this.target(sender,recipient);trip.lastRoute=this.clock;
        if(target){trip.target=target;this.scene.moveTo(sender.id,target,{onArrival:()=>this.arrive(trip)});}
      }
    }else if(trip.phase==='greeting'){
      if(this.clock-trip.arrived>4){this.finish();return;}
    }else if(trip.phase==='transferring'){
      if(this.clock-trip.transferStarted>=.45)this.receive(trip);
    }else{
      this.acknowledge(trip);
      if(this.clock-(trip.receiptTime??trip.arrived)>3){this.finish();return;}
    }
    this.paint(trip);
  }
  inspect(){return {active:this.active?{id:this.active.id,from:this.active.sender,to:this.active.recipient,phase:this.active.phase,acknowledged:!!this.active.acknowledged,noteOwner:this.active.noteOwner||this.active.sender}:null,queued:this.queue.length,completed:this.completed,noteVisible:this.note.visible};}
}
