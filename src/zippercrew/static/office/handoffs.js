import { labelTexture } from './art.js';
import { PALETTES } from './palettes.js';
import { activityCopy } from './activity.js';

const actors={Implementer:'worker',Reviewer:'reviewer',Human:'human',Planner:'planner',Critic:'planner'};
const terminal=run=>['completed','failed','stopped'].includes(run.status);
const face=(person,target)=>{
  const dx=target.x-person.x,dy=target.y-person.y;
  person.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
  person.motion.face(person.direction);
};

// A causal projection, not a workflow implementation. The server supplies every
// prerequisite. One courier presents any ready envelope in stable trace order.
// Controls participate in ordering but never appear as paper or speech.
// Catch-up acknowledges recorded receipts without pretending a walk happened.
export class OfficeHandoffs {
  constructor(scene){
    this.scene=scene;this.queue=[];this.active=null;
    this.runId=null;this.clock=0;this.cooldown=0;this.lastSpeech=new Map();
    this.receipts=new Map();this.completed=[];
    this.steps=new Map();this.done=new Set();this.presented=[];this.roleStates=new Map();
    this.catchup=false;this.catchupTimer=null;this.run=null;this.settled=false;
    document.addEventListener('visibilitychange',()=>{
      // Browser timers and Phaser may both be suspended in the background.
      // Settle on either side of that transition, before another visual frame.
      this.settle('visibility');
      this.scene.session?.decisions.checkDelivery();
    });
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
  reset() {
    this.cancel();
    this.receipts.clear();
    this.steps.clear();
    this.done.clear();
    this.runId = null;
    this.run = null;
    this.completed = [];
    this.presented = [];
    this.settled = false;
    this.roleStates.clear();
    this.lastSpeech.clear();
  }

  // Used for room changes/disconnection, never for Pause or an arriving decision.
  // Known steps survive a disconnect and are reconciled against the next snapshot.
  cancel() {
    this.clearTrip();
    this.queue = [];
    clearTimeout(this.catchupTimer);
    this.catchupTimer = null;
    this.catchup = false;
  }

  clearTrip() {
    const trip = this.active;
    this.active = null;
    this.note.setVisible(false);
    this.caption.setVisible(false);
    this.scene.conversation = null;
    this.scene.talkDots?.setVisible(false);
    if (trip) {
      if (!trip.remote) this.home(trip.sender);
      if (trip.recipientChair) this.home(trip.recipient);
    }
    for (const person of this.scene.people.values()) person.exchangeStatus = null;
  }

  satisfied(after = []) {
    return after.every(id => this.done.has(id));
  }

  refreshQueue() {
    this.queue = [...this.steps.values()]
      .filter(step => !this.settled && step.kind === 'message' && !step.control &&
        !this.done.has(step.id) && step.id !== this.active?.id)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  observe(run, {replay = false} = {}) {
    if (this.runId !== run.id) {
      this.reset();
      this.runId = run.id;
    }
    this.run = run;
    for (const message of run.messages || []) {
      this.receipts.set(message.id, message);
      // A receive may precede its send in the trace. Wait for the send's
      // dependencies instead of treating an unresolved placeholder as a root.
      if (!message.send_id) continue;
      this.steps.set(message.id, {
        ...message,
        kind: 'message',
        order: message.send_id,
        sender: actors[message.from],
        recipient: actors[message.to],
        after: message.after || [],
        queued: this.steps.get(message.id)?.queued ?? this.clock,
      });
    }
    for (const step of run.presentation || []) {
      this.steps.set(step.id, {...step, kind: 'role'});
    }
    this.refreshQueue();
    if (replay || document.hidden) {
      this.settle(replay ? 'snapshot' : 'visibility');
      return;
    }
    // Messages already sent remain admitted during Pause, even if several events
    // arrived together in this snapshot. Only the backend gates new agent calls.
    if (!this.settled && (terminal(run) || !this.scene.paused && (run.pending || this.queue.length > 4))) {
      this.compress();
    }
  }

  compress() {
    if (this.catchup) return;
    this.catchup = true;
    this.catchupUntil = this.clock + 1.8;
    this.catchupTimer = setTimeout(() => {
      if (this.scene.paused && !terminal(this.run)) {
        this.catchup = false;
        this.catchupTimer = null;
        return;
      }
      this.settle('catch-up');
      this.scene.session?.decisions.checkDelivery();
    }, 1800);
  }

  readySteps() {
    return [...this.steps.values()]
      .filter(step => !this.done.has(step.id) && this.satisfied(step.after))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }

  complete(step, mode = 'animated') {
    if (this.done.has(step.id)) return;
    this.done.add(step.id);
    this.presented.push({id: step.id, kind: step.kind, after: step.after, mode});
    if (step.kind === 'role') {
      this.roleStates.set(step.role, step);
      const person = this.scene.people.get(actors[step.role]);
      if (person) {
        const decision = person.id === 'human' && this.scene.session?.decisions;
        person.liveStatus = terminal(this.run) ? this.run.status :
          decision?.request ? (decision.arriving ? decision.arrivalLabel : 'Your decision') :
          this.run.status === 'paused' ? 'Paused' : step.state;
        if (step.state === 'waiting' && person.bubbleKind === 'work') {
          person.bubble?.destroy();
          person.bubble = null;
        }
        const text = step.activity && activityCopy(step.activity);
        const showSpeech = text && mode === 'animated' && !this.catchup &&
          !terminal(this.run) && this.run.status !== 'paused';
        const upcoming = this.scene.activity.pending.get(person.id);
        // A merged snapshot can already contain a later, informative status.
        // Replaying an earlier start must not overwrite that waiting status.
        const replace = !upcoming || this.satisfied(upcoming.after) && !upcoming.after?.includes(step.id);
        if (showSpeech && replace) {
          this.scene.activity.pending.set(person.id, {
            text, at: this.scene.worldTime, after: [step.id],
          });
        }
      }
    } else if (!step.control) {
      this.completed.push({
        id: step.id, from: step.sender, to: step.recipient, received: true, mode,
      });
    }
    this.refreshQueue();
  }

  settle(reason = 'catch-up') {
    this.clearTrip();
    clearTimeout(this.catchupTimer);
    this.catchupTimer = null;
    this.catchup = false;
    // Topological catch-up uses exactly the same prerequisites as walking.
    // Missing sends/receipts are never invented, even at a timeout or on Stop.
    let advanced = true;
    while (advanced) {
      advanced = false;
      for (const step of this.readySteps()) {
        if (step.kind === 'message' && !this.receipts.get(step.id)?.receive_id) continue;
        this.complete(step, reason);
        advanced = true;
      }
    }
    this.scene.activity?.pending.clear();
    // Unreceived sends stay in the trace, but a terminal run must not keep
    // trying to deliver them or imply that the recipient acknowledged them.
    this.settled = !!this.run && terminal(this.run);
    this.refreshQueue();
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
    if(!sender||!recipient||sender===recipient)return false;
    const target=this.target(sender,recipient);
    if(!target)return false;
    const trip={...message,phase:'walking',started:this.clock,lastRoute:this.clock,target};
    this.active=trip;
    this.refreshQueue();
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
    if(!trip.remote)this.home(trip.sender);
    this.scene.people.get(trip.sender).exchangeStatus='Handover complete';
    const recipient=this.scene.people.get(trip.recipient);
    recipient.exchangeStatus=`Received ${trip.label.toLowerCase()} from ${this.scene.people.get(trip.sender).name}`;
    this.speak(trip.recipient,`${trip.label.toUpperCase()} RECEIVED.`,{force:true,duration:3});
    this.complete(trip);this.scene.ui.updatePerson();
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
    const remote=this.active?.remote;
    this.clearTrip();this.cooldown=this.catchup?0:remote?0.1:0.5;this.refreshQueue();
    this.scene.ui.updatePerson();
  }

  sendPaper(message){
    const sender=this.scene.people.get(message.sender),recipient=this.scene.people.get(message.recipient);
    if(!sender||!recipient)return false;
    this.clearTrip();
    const trip={...message,remote:true,phase:'transferring',transferStarted:this.clock,
      transferDuration:this.catchup?0.12:0.25,
      noteOwner:message.sender,acknowledged:true};
    this.active=trip;
    this.refreshQueue();
    sender.exchangeStatus=`Sending ${message.label.toLowerCase()} to ${recipient.name}`;
    this.paint(trip);
    return true;
  }

  showStaticPaper(message) {
    const sender = this.scene.people.get(message.sender);
    const recipient = this.scene.people.get(message.recipient);
    if (!sender || !recipient) return false;
    this.clearTrip();
    this.active = {...message, remote: true, static: true, phase: 'received',
      acknowledged: true, noteOwner: message.recipient, receiptTime: this.clock};
    recipient.exchangeStatus = `${message.label} from ${sender.name}`;
    // Reduced motion removes travel, not communication. A single static receipt
    // states both the message and its sender, in the same causal order as walks.
    this.scene.say(recipient.id, `${message.label.toUpperCase()} FROM ${sender.name.toUpperCase()}.`, 0.9, 'conversation');
    this.paint(this.active);
    this.complete(message, 'static');
    this.scene.ui.updatePerson();
    return true;
  }

  paint(trip){
    const hand=id=>{const p=this.scene.people.get(id);return {x:Math.round(p.x)+(p.direction==='left'?-17:9),y:Math.round(p.y)-24};};
    const sender=this.scene.people.get(trip.sender),from=hand(trip.sender),to=hand(trip.recipient);
    let position=trip.noteOwner===trip.recipient?to:from;
    if(trip.phase==='transferring'){
      const t=Math.min(1,(this.clock-trip.transferStarted)/(trip.transferDuration??0.45));
      position={x:Math.round(from.x+(to.x-from.x)*t),y:Math.round(from.y+(to.y-from.y)*t-Math.sin(t*Math.PI)*3)};
    }
    this.note.setTexture(this.noteKey(trip.sender)).setPosition(position.x,position.y).setVisible(true);
    const p=sender;
    const title=['Proposal','Review','Guidance','Task'].includes(trip.label)?trip.label.toUpperCase():'NOTE';
    this.caption.setTexture(labelTexture(this.scene,title,{color:'bubbleInk',background:'bubble',accent:trip.sender}));
    this.caption.setPosition(Math.round(p.x-this.caption.width/2),Math.round(p.y)+17)
      .setVisible(trip.phase==='walking'&&!p.bubble);
  }
  update(dt) {
    this.clock += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (document.hidden) {
      this.settle('visibility');
      return;
    }
    if (!this.run || this.settled) return;
    if (this.scene.paused && this.catchup && !terminal(this.run)) {
      clearTimeout(this.catchupTimer);
      this.catchupTimer = null;
      this.catchup = false;
    }
    if (this.scene.paused && this.active && !this.active.static) {
      this.showStaticPaper(this.steps.get(this.active.id));
    }
    if (this.scene.paused && !this.active && this.scene.worldTime < (this.scene.reactionUntil || 0)) return;
    if (this.catchup && this.clock >= this.catchupUntil) {
      this.settle('catch-up');
      return;
    }
    if (this.active && this.catchup && !this.active.remote &&
        this.receipts.get(this.active.id)?.receive_id) {
      this.sendPaper(this.steps.get(this.active.id));
    }
    if (!this.active && !this.cooldown) this.presentNext();
    const trip = this.active;
    if (!trip) return;
    const sender = this.scene.people.get(trip.sender);
    const recipient = this.scene.people.get(trip.recipient);
    if (trip.phase === 'walking') {
      if (this.clock - trip.started > 12) {
        if (this.receipts.get(trip.id)?.receive_id) this.sendPaper(this.steps.get(trip.id));
        else this.finish();
        return;
      }
      const stopped = !sender.route.length && !sender.transition;
      const movedAway = Math.hypot(trip.target.x - recipient.x, trip.target.y - recipient.y) > 44;
      if (this.clock - trip.lastRoute > 1.5 && (stopped || movedAway)) {
        const target = this.target(sender, recipient);
        trip.lastRoute = this.clock;
        if (target) {
          trip.target = target;
          this.scene.moveTo(sender.id, target, {onArrival: () => this.arrive(trip)});
        }
      }
    } else if (trip.phase === 'greeting') {
      if (this.clock - trip.arrived > 4) { this.finish(); return; }
    } else if (trip.phase === 'transferring') {
      if (this.clock - trip.transferStarted >= (trip.transferDuration ?? 0.45)) this.receive(trip);
    } else {
      this.acknowledge(trip);
      const hold = this.catchup ? 0.03 : trip.static ? 0.9 : trip.remote ? 0.15 : 1.5;
      if (this.clock - (trip.receiptTime ?? trip.arrived) > hold) { this.finish(); return; }
    }
    this.paint(trip);
  }

  presentNext() {
    for (const step of this.readySteps()) {
      if (step.kind === 'role') {
        this.complete(step);
        continue;
      }
      const receipt = this.receipts.get(step.id)?.receive_id;
      // A sent message may sit in the recipient's inbox while they finish work.
      // Wait for the real receipt rather than walking over and repeatedly leaving.
      if (!receipt) continue;
      if (step.control) {
        if (receipt) this.complete(step);
        continue;
      }
      if (!this.scene.people.has(step.sender) || !this.scene.people.has(step.recipient)) {
        if (receipt) this.complete(step, 'unrepresented');
        continue;
      }
      if (this.scene.paused) {
        if (this.showStaticPaper(step)) break;
        continue;
      }
      // A human's paper travels, their avatar always stays under user control.
      const remote = step.sender === 'human' || this.catchup || this.clock - step.queued > 12;
      if (remote && !receipt) continue;
      if (remote ? this.sendPaper(step) : this.start(step)) break;
      if (receipt) this.sendPaper(step); // A blocked path still gets a visible paper.
      if (this.active) break;
    }
  }
  inspect(){return {active:this.active?{id:this.active.id,from:this.active.sender,to:this.active.recipient,phase:this.active.phase,acknowledged:!!this.active.acknowledged,noteOwner:this.active.noteOwner||this.active.sender}:null,queued:this.queue.length,completed:this.completed,presented:this.presented,noteVisible:this.note.visible};}
}
