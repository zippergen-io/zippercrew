import { WORLD } from './world.js';
import { CHARACTER_ANCHORS, SEATED_FRAMES } from './art.js';
import { DIRECTIONS } from './avatar-motion.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const facing=(from,to)=>Math.abs(to.x-from.x)>Math.abs(to.y-from.y)
  ?to.x>from.x?'right':'left':to.y>from.y?'down':'up';

// A chair's seat is a hip contact point. The sprite position is always its feet.
// Those anchors are deliberately separate from image bounds and sorting depth.
export class Seating {
  constructor(scene) {
    this.scene=scene;
    this.chairs=new Map(WORLD.furniture.filter(f=>f.seat).map(f=>
      [f.id,{...f,occupant:null,reservedBy:null}]));
  }

  points(chair) {
    const {hip,feet}=CHARACTER_ANCHORS;
    const approaches=(chair.seat.approaches||[chair.seat.approach])
      .map(point=>({x:chair.x+point.x,y:chair.y+point.y}));
    return {
      hip:{x:chair.x+chair.seat.x,y:chair.y+chair.seat.y},
      feet:{x:chair.x+chair.seat.x+feet.x-hip.x,
        y:chair.y+chair.seat.y+feet.y-hip.y},
      approaches,
    };
  }

  clear(chair,from,to,person=null) {
    const steps=Math.max(1,Math.ceil(distance(from,to)));
    const others=person?this.scene.collisionBodies(person):[];
    for(let step=0;step<=steps;step++){
      const t=step/steps,x=from.x+(to.x-from.x)*t,y=from.y+(to.y-from.y)*t;
      if(!this.scene.nav.free(x,y,chair.id)||others.some(p=>Math.hypot(x-p.x,y-p.y)<11))return false;
    }
    return true;
  }

  entry(person,chair,leaving=false,toward=person.goal) {
    const {feet,approaches}=this.points(chair);
    const candidates=approaches.filter(point=>this.scene.nav.free(point.x,point.y)&&this.clear(chair,feet,point));
    if(leaving){
      const goal=toward||person.seatEntry||person;
      candidates.sort((a,b)=>distance(a,goal)-distance(b,goal));
      // If both sides are occupied, wait at the seat until one clears. Never
      // substitute a point behind the backrest to get around a blocked exit.
      return candidates.find(point=>this.clear(chair,person,point,person))||candidates[0];
    }
    const others=this.scene.collisionBodies(person);
    return candidates.map(point=>{
      const route=this.scene.nav.route(person,point,others);
      // A* can suggest a nearby free goal. That is useful for walking, but a
      // chair entry must actually reach the chosen side (within grid rounding).
      if(!route.length||distance(route.at(-1),point)>3||!this.clear(chair,point,feet,person))return null;
      const cost=route.reduce((sum,p,i)=>sum+distance(i?route[i-1]:person,p),0);
      return {point,cost};
    }).filter(Boolean).sort((a,b)=>a.cost-b.cost)[0]?.point;
  }

  cancelApproach(person) {
    if(person.seatApproach){
      const chair=this.chairs.get(person.seatApproach);
      if(chair.reservedBy===person.id)chair.reservedBy=null;
      person.seatApproach=null;
    }
  }

  request(id,chairId,status='Settling in at a desk') {
    const person=this.scene.people.get(id),chair=this.chairs.get(chairId);
    if(!chair || [chair.occupant,chair.reservedBy].some(who=>who&&who!==id))return false;
    if(person.seated===chairId&&person.transition?.kind!=='stand')return true;
    if(person.seated){
      this.stand(person,()=>this.request(id,chairId,status));return true;
    }
    this.cancelApproach(person);
    const entry=this.entry(person,chair);if(!entry)return false;
    chair.reservedBy=id;person.seatApproach=chairId;
    const started=this.scene.moveTo(id,entry,{
      status,preserveSeatReservation:true,onArrival:()=>{
        // A crowd-triggered reroute must not turn into a diagonal shortcut.
        if(!this.sit(person,chair))this.request(id,chairId,status);
      },
    });
    if(!started)this.cancelApproach(person);
    this.scene.updateSeatUI();
    return started;
  }

  sit(person,chair,instant=false) {
    if(chair.occupant&&chair.occupant!==person.id)return false;
    const {feet:target,approaches}=this.points(chair);
    const entry=approaches.find(point=>distance(point,person)<=3);
    if(!instant&&(!entry||!this.clear(chair,person,target)))return false;
    this.cancelApproach(person);
    chair.occupant=person.id;person.seated=chair.id;
    person.direction=chair.seat.direction;person.route=[];
    person.seatEntry=entry||null;
    if(instant){person.x=target.x;person.y=target.y;person.transition=null;}
    else person.transition={kind:'sit',from:{x:person.x,y:person.y},to:target,
      direction:facing(person,target),progress:0,duration:.42,
      complete:()=>this.scene.updateSeatUI()};
    this.scene.updateSeatUI();return true;
  }

  stand(person,complete=()=>{},toward=person.goal) {
    if(!person.seated){complete();return;}
    if(person.transition?.kind==='stand'){person.transition.after=complete;return;}
    const chair=this.chairs.get(person.seated);
    const exit=this.entry(person,chair,true,toward);if(!exit)return;
    person.transition={kind:'stand',from:{x:person.x,y:person.y},
      to:exit,direction:facing(person,exit),progress:0,duration:.42,after:complete,
      complete:()=>{
        chair.occupant=null;person.seated=null;
        this.scene.updateSeatUI();
      }};
  }

  update(person,dt) {
    const t=person.transition;if(!t)return;
    const next=Math.min(1,t.progress+dt/t.duration);
    const x=t.from.x+(t.to.x-t.from.x)*next,y=t.from.y+(t.to.y-t.from.y)*next;
    const crowded=this.scene.collisionBodies(person).some(other=>
      Math.hypot(x-other.x,y-other.y)<11);
    if(crowded)return; // Keep ownership until the person can safely stand up.
    person.x=x;person.y=y;t.progress=next;
    person.direction=this.stepping(t)?t.direction:this.chairs.get(person.seated).seat.direction;
    if(next===1){person.transition=null;t.complete?.();t.after?.();}
  }

  stepping(transition){return transition.kind==='sit'?transition.progress<.72:transition.progress>.28;}

  frame(person,time) {
    if(!person.seated)return null;
    const base=SEATED_FRAMES[this.chairs.get(person.seated).seat.direction];
    if(person.transition){
      person.restSince=null;
      const t=person.transition;
      return this.stepping(t)?DIRECTIONS[t.direction]*4+Math.floor(distance(t.from,person)/5)%4:base;
    }
    const working=this.scene.activity?.isWorking(person)&&!(person.reactionUntil>this.scene.worldTime);
    if(working){person.restSince=null;return base+Math.floor(time*5)%2;}
    person.restSince??=time;
    // Hold each look for seconds rather than alternating frames near a stop.
    const age=(time-person.restSince+(person.id==='reviewer'?2:0))%14;
    return base+(age>=9&&age<12?3:2);
  }

  inspect(person) {
    if(!person.seated)return null;
    const chair=this.chairs.get(person.seated),{hip,feet}=CHARACTER_ANCHORS;
    return {chair:chair.id,posture:person.transition?.kind||'seated',
      anchor:this.points(chair).hip,
      actualHip:{x:person.x+hip.x-feet.x,y:person.y+hip.y-feet.y},
      feet:{x:person.x,y:person.y},depth:person.sprite.depth};
  }
}
