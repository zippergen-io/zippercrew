import { WORLD } from './world.js';
import { CHARACTER_ANCHORS, SEATED_FRAMES } from './art.js';

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
    return {
      hip:{x:chair.x+chair.seat.x,y:chair.y+chair.seat.y},
      feet:{x:chair.x+chair.seat.x+feet.x-hip.x,
        y:chair.y+chair.seat.y+feet.y-hip.y},
      approach:{x:chair.x+chair.seat.approach.x,y:chair.y+chair.seat.approach.y},
    };
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
    if(person.seated===chairId&&!person.transition)return true;
    this.cancelApproach(person);
    chair.reservedBy=id;person.seatApproach=chairId;
    const started=this.scene.moveTo(id,this.points(chair).approach,{
      status,preserveSeatReservation:true,onArrival:()=>this.sit(person,chair),
    });
    if(!started)this.cancelApproach(person);
    this.scene.updateSeatUI();
    return started;
  }

  sit(person,chair,instant=false) {
    if(chair.occupant&&chair.occupant!==person.id)return false;
    this.cancelApproach(person);
    chair.occupant=person.id;person.seated=chair.id;
    person.direction=chair.seat.direction;person.route=[];
    const target=this.points(chair).feet;
    if(instant){person.x=target.x;person.y=target.y;person.transition=null;}
    else person.transition={kind:'sit',from:{x:person.x,y:person.y},to:target,
      progress:0,duration:.32,complete:()=>this.scene.updateSeatUI()};
    this.scene.updateSeatUI();return true;
  }

  stand(person,complete=()=>{}) {
    if(!person.seated){complete();return;}
    if(person.transition?.kind==='stand'){person.transition.after=complete;return;}
    const chair=this.chairs.get(person.seated);
    person.transition={kind:'stand',from:{x:person.x,y:person.y},
      to:this.points(chair).approach,progress:0,duration:.32,after:complete,
      complete:()=>{
        chair.occupant=null;person.seated=null;
        this.scene.updateSeatUI();
      }};
  }

  update(person,dt) {
    const t=person.transition;if(!t)return;
    const next=Math.min(1,t.progress+dt/t.duration);
    const x=t.from.x+(t.to.x-t.from.x)*next,y=t.from.y+(t.to.y-t.from.y)*next;
    const crowded=[...this.scene.people.values()].some(other=>other!==person&&
      Math.hypot(x-other.x,y-other.y)<11);
    if(crowded)return; // Keep ownership until the person can safely stand up.
    person.x=x;person.y=y;t.progress=next;
    if(next===1){person.transition=null;t.complete?.();t.after?.();}
  }

  frame(person,time) {
    if(!person.seated || (person.transition?.kind==='stand'&&person.transition.progress>.5))return null;
    return SEATED_FRAMES[this.chairs.get(person.seated).seat.direction]+Math.floor(time*2)%2;
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
