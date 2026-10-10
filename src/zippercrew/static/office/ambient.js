import { SOCIAL_SPOTS } from './world.js';

// Ambient gestures are explicitly non-task behavior. They never make claims
// about agent reasoning, tool execution or message delivery and never move You.
export class OfficeAmbient {
  constructor(scene){this.scene=scene;this.trip=null;this.next=scene.elapsed+16;this.turn=0;}
  eligible(){
    const s=this.scene,run=s.session?.taskRun;
    return !!(s.session?.initialized&&s.session.room&&s.session.connected&&!s.paused&&!s.handoffs.active&&!s.handoffs.queue.length&&!run?.pending&&
      !['stopped','failed','paused'].includes(run?.status));
  }
  cancel(){
    const trip=this.trip;if(!trip)return;
    this.trip=null;this.next=this.scene.elapsed+24;
    if(this.scene.conversation?.ambient){this.scene.conversation=null;this.scene.talkDots.setVisible(false);}
    for(const id of trip.ids){
      const p=this.scene.people.get(id);p.ambientStatus=null;
      if(['idle','conversation'].includes(p.bubbleKind)){p.bubble?.destroy();p.bubble=null;}
      this.scene.handoffs.home(id);
    }
    this.scene.ui.updatePerson();
  }
  start(){
    if(!this.eligible())return false;
    const s=this.scene,people=['worker','reviewer','planner'].map(id=>s.people.get(id)).filter(Boolean);
    const available=people.filter(p=>s.session.configuration.isReady(p.id)&&!s.activity.isWorking(p)&&!p.route.length&&!p.transition&&!p.seatApproach);
    if(!available.length)return false;
    const spot=SOCIAL_SPOTS[this.turn%SOCIAL_SPOTS.length],pair=available.length===2&&this.turn%3===0;
    const ids=pair?available.map(p=>p.id):[available[this.turn%available.length].id];
    const trip={ids,spot:spot.id,arrivals:new Set(),phase:'walking',started:s.elapsed};this.trip=trip;this.turn++;
    ids.forEach((id,index)=>{
      const p=s.people.get(id);p.ambientStatus=spot.label;
      const moved=s.moveTo(id,spot.points[index],{status:spot.label,onArrival:()=>{
        if(this.trip!==trip)return;
        trip.arrivals.add(id);
        if(trip.arrivals.size===ids.length){
          trip.phase='rest';trip.arrived=s.elapsed;
          p.direction='down';
          if(ids.length===2){
            const a=s.people.get(ids[0]),b=s.people.get(ids[1]);a.direction='right';b.direction='left';
            s.conversation={a:a.id,b:b.id,ambient:true};
            s.say(a.id,spot.id==='coffee'?'COFFEE BREAK?':'A QUICK BREAK?',3,'conversation');
          }else s.say(id,spot.id==='coffee'?'A QUICK COFFEE.':'A MOMENT TO PAUSE.',3,'idle');
          s.ui.updatePerson();
        }
      }});
      if(!moved)trip.failed=true;
    });
    if(trip.failed){this.cancel();return false;}
    return true;
  }
  update(){
    if(!this.eligible()||this.trip?.ids.some(id=>!this.scene.session.configuration.isReady(id)||this.scene.activity.isWorking(this.scene.people.get(id)))){this.cancel();return;}
    const s=this.scene,trip=this.trip;
    if(!trip){
      if(s.elapsed>=this.next){this.next=s.elapsed+20;this.start();}
      return;
    }
    if(s.elapsed-trip.started>18){this.cancel();return;}
    if(trip.phase!=='rest')return;
    const age=s.elapsed-trip.arrived;
    if(age>3.5&&!trip.responded){
      trip.responded=true;
      if(trip.ids.length===2)s.say(trip.ids[1],'JUST A MINUTE.',3,'conversation');
      else s.people.get(trip.ids[0]).direction=trip.spot==='coffee'?'up':'left';
    }
    if(age>7)this.cancel();
  }
  inspect(){return this.trip?{ids:this.trip.ids,spot:this.trip.spot,phase:this.trip.phase}:null;}
}
