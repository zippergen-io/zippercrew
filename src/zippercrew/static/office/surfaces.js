import { WORLD, TOP_WALL } from './world.js';

const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const line=(c,x,y,tx,ty,color)=>{
  c.fillStyle=color;let dx=Math.abs(tx-x),sx=x<tx?1:-1,dy=-Math.abs(ty-y),sy=y<ty?1:-1,err=dx+dy;
  for(;;){c.fillRect(x,y,1,1);if(x===tx&&y===ty)break;const e=2*err;if(e>=dy){err+=dy;x+=sx;}if(e<=dx){err+=dx;y+=sy;}}
};
export class OfficeSurfaces {
  constructor(scene){
    this.scene=scene;this.screens=[];
    const add=(key,x,y,w,h,depth)=>{
      const source=canvas(w,h),texture=scene.textures.addCanvas(key,source);
      const sprite=scene.add.image(x,y,key).setOrigin(0).setDepth(depth);
      return {source,texture,sprite};
    };
    for(const desk of WORLD.furniture.filter(f=>f.type==='desk')){
      this.screens.push({...add(`live-screen:${desk.id}`,desk.x+29,desk.y+2,28,14,desk.y+39.1),owner:desk.owner,variant:desk.variant});
      if(desk.variant===1)this.screens.push({...add('live-screen:portrait',desk.x+9,desk.y+3,11,14,desk.y+39.1),owner:desk.owner,variant:4});
    }
    this.clock=add('live-clock',TOP_WALL.clock.x+3,TOP_WALL.clock.y+3,13,13,2);
    this.coffee=add('coffee-steam',449,59,10,14,98);
    this.update();
  }
  update(now=new Date()){
    const scene=this.scene,night=scene.mood==='night';
    // Wall time stays live while scene motion is paused; no simulation-time drift.
    const clockKey=`${scene.mood}:${now.getHours()}:${now.getMinutes()}`;
    if(clockKey!==this.clockKey){
      this.clockKey=clockKey;this.clockTime={hours:now.getHours(),minutes:now.getMinutes()};
      const {source,texture}=this.clock,c=source.getContext('2d');c.clearRect(0,0,13,13);
      c.fillStyle=night?'#989086':'#f0e8d0';c.fillRect(0,0,13,13);
      c.fillStyle=night?'#c5b99f':'#b6af93';for(const [x,y]of[[6,0],[12,6],[6,12],[0,6]])c.fillRect(x,y,1,1);
      const hand=(angle,length,color)=>line(c,6,6,6+Math.round(Math.sin(angle)*length),6-Math.round(Math.cos(angle)*length),color);
      hand((now.getHours()%12+now.getMinutes()/60)*Math.PI/6,3,night?'#343d4a':'#60574f');
      hand(now.getMinutes()*Math.PI/30,5,night?'#343d4a':'#60574f');
      c.fillStyle=night?'#dfb466':'#b8884c';c.fillRect(6,6,1,1);texture.refresh();
    }
    for(const screen of this.screens){
      const person=scene.people.get(screen.owner),working=person&&scene.activity?.isWorking(person);
      const event=person&&scene.activity?.current(person),phase=working?Math.floor(scene.elapsed*3):0;
      const key=`${scene.mood}:${working}:${phase}:${event?.category}:${event?.phase}`;
      screen.sprite.setVisible(!!working); // Preserve each authored desktop at rest.
      if(screen.key===key)continue;screen.key=key;screen.working=!!working;
      const {source,texture,variant}=screen,c=source.getContext('2d'),w=source.width;
      const r=(x,y,width,height,color)=>{c.fillStyle=color;c.fillRect(x,y,width,height);};
      r(0,0,w,14,night?'#6d9bad':'#96bfcc');r(1,1,w-2,1,night?'#a8cbd0':'#d1e1e3');
      if(working){
        r(1,3,w-2,10,night?'#36576d':'#486b82');
        if(variant===2){
          r(5,3,17,10,night?'#abc1c6':'#d7e3e5');
          for(let i=0;i<3;i++){r(7,5+i*3,2,1,i===(phase%3)?'#c87567':'#7595a5');r(11,5+i*3,8-i,1,'#7898aa');}
        }else{
          for(let i=0;i<3;i++){
            const y=5+i*3;r(2,y,2,1,night?'#d7b77f':'#d9c796');
            r(6,y,Math.max(1,Math.min(w-8,5+((phase+i*5)%(w-7)))),1,night?'#b1d4d8':'#c2d5d9');
          }
          if(phase%2===0)r(w-4,11,2,1,'#e6d1a8');
        }
        if(['tests','lint','types','build'].includes(event?.category))r(1,13,5+phase%Math.max(1,w-6),1,event.phase==='completed'?'#c1cdbb':'#d5b47f');
      }
      texture.refresh();
    }
    const steaming=scene.ambient?.trip?.spot==='coffee'&&scene.ambient.trip.phase==='rest';
    this.coffee.sprite.setVisible(!!steaming);
    if(steaming){
      const frame=Math.floor(scene.elapsed*2)%3,key=`${frame}:${night}`;
      if(this.coffee.key!==key){this.coffee.key=key;const c=this.coffee.source.getContext('2d');c.clearRect(0,0,10,14);c.fillStyle=night?'#cbb89a':'#f4ead9';c.fillRect(3+frame%2,6-frame*2,1,3);c.fillRect(6-frame%2,8-frame*2,1,2);this.coffee.texture.refresh();}
    }
  }
}
