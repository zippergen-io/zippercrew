// Presentation state uses actual displacement, never a path node or key press.
// Simulation coordinates stay precise; the scene snaps only the rendered feet.
export const DIRECTIONS={down:0,left:1,right:2,up:3};
const HORIZONTAL=new Set(['left','right']);
const TURN_TIME=.1,TURN_DISTANCE=2.5,TURN_LOCK=.18,STOP_DELAY=.12;

export class AvatarMotion {
  constructor(direction,index=0){
    this.direction=direction;this.walking=false;this.distance=0;this.startDistance=0;
    this.startX=0;this.startY=0;
    this.stillFor=0;this.idleFor=0;this.turnAge=TURN_LOCK;
    this.blinkDelay=5.2+index*.7;this.blinkWait=this.blinkDelay;this.blinkLeft=0;
    this.clearTurn();
  }

  clearTurn(){this.candidate=null;this.turnDistance=0;this.turnTime=0;}

  face(direction){
    this.direction=direction;this.turnAge=0;this.clearTurn();this.blinkLeft=0;
  }

  settle(){
    this.walking=false;this.distance=0;this.startDistance=0;
    this.startX=0;this.startY=0;
    this.clearTurn();this.idleFor=0;this.blinkLeft=0;this.blinkWait=this.blinkDelay;
  }

  update(dx,dy,dt,{allowTurn=true,posture=false,animateIdle=true}={}){
    this.turnAge+=dt;
    if(posture){this.settle();return DIRECTIONS[this.direction]*4;}
    const distance=Math.hypot(dx,dy),moved=distance>.01;
    if(moved){
      this.stillFor=0;this.idleFor=0;this.blinkLeft=0;this.blinkWait=this.blinkDelay;
      this.startX+=dx;this.startY+=dy;
      this.startDistance=Math.hypot(this.startX,this.startY);
      if(this.startDistance>=.75)this.walking=true;
      this.distance+=distance;

      // Keep the current axis near a diagonal; require clear dominance to turn.
      const horizontal=HORIZONTAL.has(this.direction),ax=Math.abs(dx),ay=Math.abs(dy);
      const useX=horizontal?ay<=ax*1.35:ax>ay*1.35;
      const next=useX?(dx>=0?'right':'left'):(dy>=0?'down':'up');
      if(!allowTurn||next===this.direction)this.clearTurn();
      else{
        if(this.candidate!==next){this.clearTurn();this.candidate=next;}
        this.turnDistance+=distance;this.turnTime+=dt;
        if(this.turnTime+1e-6>=TURN_TIME&&this.turnDistance>=TURN_DISTANCE&&this.turnAge>=TURN_LOCK){
          this.direction=next;this.turnAge=0;this.clearTurn();
        }
      }
    }else{
      this.stillFor+=dt;
      // Brief path/collision pauses hold the current gait frame. A real stop
      // settles once, keeping the last committed facing and clearing any turn.
      if(this.stillFor>=STOP_DELAY){
        if(this.walking||this.startDistance)this.settle();
        this.clearTurn();
        if(animateIdle){
          this.idleFor+=dt;
          if(this.blinkLeft>0)this.blinkLeft=Math.max(0,this.blinkLeft-dt);
          else if(this.idleFor>1){
            this.blinkWait-=dt;
            if(this.blinkWait<=0){this.blinkLeft=.12;this.blinkWait=this.blinkDelay;}
          }
        }
      }
    }
    if(this.blinkLeft>0)return 24+DIRECTIONS[this.direction];
    return DIRECTIONS[this.direction]*4+(this.walking?Math.floor(this.distance/5)%4:0);
  }
}
