import {BOARD} from './task-board.js';

// Native-pixel circle with a slowly travelling warm arc. No bloom or flashing.
export class DecisionAttention {
  constructor(scene){
    this.scene=scene;
    for(const mood of ['day','night'])for(let frame=0;frame<24;frame++){
      const canvas=document.createElement('canvas');canvas.width=48;canvas.height=48;
      const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;
      for(let i=0;i<144;i++){
        const angle=i*Math.PI/72,x=24+Math.round(Math.cos(angle)*21),y=24+Math.round(Math.sin(angle)*21);
        const distance=(i-frame*6+144)%144;
        c.fillStyle=distance<27?(mood==='night'?'#a79573':'#b28238'):(mood==='night'?'#8f87752b':'#ac792d40');
        c.fillRect(x,y,1,1);
      }
      scene.textures.addCanvas(`${mood}:decision-ring:${frame}`,canvas);
    }
    this.sprite=scene.add.image(0,0,'day:decision-ring:0').setOrigin(.5).setVisible(false);
  }
  update(){
    const s=this.scene,p=s.people.get('human'),run=s.session?.taskRun;
    const visible=!!(p&&s.session?.connected&&s.session.decisions.pending&&run);
    this.sprite.setVisible(visible);if(!visible)return;
    const frame=s.paused?0:Math.floor(s.elapsed*4)%24;
    this.sprite.setTexture(`${s.mood}:decision-ring:${frame}`)
      .setPosition(Math.round(p.x),Math.round(p.y)-15).setDepth(Math.round(p.y)+2);
  }
}

// Steady native-pixel setup cues. No pulse is required to discover an object,
// including with reduced motion. Night uses a softer fill to preserve the lighting.
export function setupHighlightTexture(scene,board){
  const key=`${scene.mood}:setup-highlight:${board?'board':'agent'}`;
  if(scene.textures.exists(key))return key;
  const canvas=document.createElement('canvas');
  canvas.width=board?BOARD.width+4:60;canvas.height=board?56:60;
  const c=canvas.getContext('2d'),night=scene.mood==='night';
  c.imageSmoothingEnabled=false;
  const fill=night?(board?'#f3f1e666':'#f3f1e675'):(board?'#ffffff85':'#ffffffa6');
  const edge=night?'#e1e6e57a':'#ffffffda';
  c.fillStyle=fill;c.fillRect(1,1,canvas.width-2,canvas.height-2);
  c.fillStyle=edge;
  c.fillRect(1,0,canvas.width-2,1);c.fillRect(1,canvas.height-1,canvas.width-2,1);
  c.fillRect(0,1,1,canvas.height-2);c.fillRect(canvas.width-1,1,1,canvas.height-2);
  scene.textures.addCanvas(key,canvas);
  return key;
}
