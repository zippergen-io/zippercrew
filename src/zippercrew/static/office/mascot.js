import { COMPANION } from './world.js';
import { createCrocodileArt } from './crocodile-art.js';

// A background inhabitant, deliberately outside people, workflow and hit tests.
// The companion never reserves paths, creates messages or delays a real actor.
export class OfficeMascot {
  constructor(scene){
    this.scene=scene;this.id=COMPANION.size==='small'?'crocodile-small':'crocodile';this.spot=0;
    Object.assign(this,COMPANION.spots[0]);
    this.route=[];this.state='rest';this.quietFor=0;this.restFor=0;
    this.nextWalk=scene.elapsed+COMPANION.firstWalk;this.distance=0;this.facing='left';
    this.previousPeople=new Map();
    createCrocodileArt(scene);
    // Preserve the original sheets untouched. Bake a ~6% smaller variant onto
    // the same native pixel grid, rather than fractionally scaling the sprite.
    // Each frame uses identical sampling and keeps its original ground anchor.
    for(const mood of ['day','night']){
      const source=scene.textures.get(`${mood}:person-crocodile`).getSourceImage();
      const canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=36;
      const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
      for(let frame=0;frame<6;frame++)ctx.drawImage(source,frame*32,0,32,36,frame*32+1,2,30,34);
      scene.textures.addSpriteSheet(`${mood}:person-crocodile-small`,canvas,{frameWidth:32,frameHeight:36});
    }
    this.sprite=scene.add.sprite(this.x,this.y,`${scene.mood}:person-${this.id}`,0)
      .setOrigin(16/32,33/36).setDepth(this.y);
  }

  quiet(){
    const s=this.scene;
    let moving=false;
    for(const p of s.people.values()){
      const previous=this.previousPeople.get(p.id);
      moving ||= !!(p.route.length||p.transition||(previous&&Math.hypot(p.x-previous.x,p.y-previous.y)>.01));
      this.previousPeople.set(p.id,{x:p.x,y:p.y});
      if(p.bubble)moving=true;
    }
    return !moving&&!s.paused&&!document.hidden&&!s.conversation&&!s.selected
      &&!s.handoffs?.active&&!s.handoffs?.queue.length&&!s.session?.taskRun?.pending
      &&!document.querySelector('dialog[open],.popover:not([hidden]),.context-card:not([hidden]),.studio-drawer:not([hidden])');
  }

  beginWalk(){
    const s=this.scene,next=(this.spot+1)%COMPANION.spots.length,target=COMPANION.spots[next];
    const people=[...s.people.values()];
    if(people.some(p=>Math.hypot(p.x-target.x,p.y-target.y)<24))return;
    const route=s.nav.route(this,target,people);
    const b=COMPANION.bounds;
    // Never take a detour through the workspace if an edge route is occupied.
    if(!route.length||route.some(p=>p.x<b.x||p.x>b.x+b.width||p.y<b.y||p.y>b.y+b.height))return;
    this.route=route;this.spot=next;this.state='walk';this.restFor=0;
    // Lock the silhouette for the entire short trip, including grid corrections.
    if(Math.abs(target.x-this.x)>3)this.facing=target.x<this.x?'left':'right';
  }

  update(dt){
    const s=this.scene,quiet=this.quiet();
    this.quietFor=quiet?this.quietFor+dt:0;
    if(quiet&&this.quietFor>=COMPANION.quietDelay){
      if(!this.route.length){
        this.restFor+=dt;
        this.state=this.restFor%18>14?'peek':'rest';
        if(s.elapsed>=this.nextWalk){
          this.nextWalk=s.elapsed+8; // Occupied nooks are retried quietly, never forced.
          this.beginWalk();
        }
      }
      let budget=COMPANION.speed*dt;
      while(this.route.length&&budget>0){
        const target=this.route[0],dx=target.x-this.x,dy=target.y-this.y,d=Math.hypot(dx,dy),step=Math.min(d,budget);
        const nx=this.x+(d?dx/d*step:0),ny=this.y+(d?dy/d*step:0);
        if([...s.people.values()].some(p=>Math.hypot(p.x-nx,p.y-ny)<24))break;
        this.x=nx;this.y=ny;this.distance+=step;budget-=step;
        if(d<=step+.0001){this.route.shift();if(!this.route.length){
          this.state='rest';this.restFor=0;
          this.nextWalk=s.elapsed+COMPANION.restDurations[this.spot];
        }}
      }
    }
    const walking=this.route.length&&quiet&&this.quietFor>=COMPANION.quietDelay;
    const frame=walking?3+Math.floor(this.distance/3)%2:this.route.length?2:
      this.state==='peek'?(this.restFor%4>3.8?5:2):this.restFor%12>11.8?1:0;
    this.sprite.setTexture(s.lighting.characterKey(this),frame).setFlipX(this.facing==='right')
      .setPosition(Math.round(this.x),Math.round(this.y)).setDepth(Math.round(this.y));
  }

  inspect(){return {x:this.x,y:this.y,state:this.state,walking:!!this.route.length,
    yielding:this.quietFor<COMPANION.quietDelay,facing:this.facing,spot:this.spot};}
}
