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
        c.fillStyle=distance<27?(mood==='night'?'#ecc17e':'#b28238'):(mood==='night'?'#d2a34f45':'#ac792d40');
        c.fillRect(x,y,1,1);
      }
      scene.textures.addCanvas(`${mood}:decision-ring:${frame}`,canvas);
    }
    this.sprite=scene.add.image(0,0,'day:decision-ring:0').setOrigin(.5).setVisible(false);
  }
  update(){
    const s=this.scene,p=s.people.get('human'),run=s.session?.taskRun;
    const visible=!!(p&&s.session?.connected&&run?.pending&&!['completed','stopped','failed'].includes(run.status));
    this.sprite.setVisible(visible);if(!visible)return;
    const frame=s.paused?0:Math.floor(s.elapsed*4)%24;
    this.sprite.setTexture(`${s.mood}:decision-ring:${frame}`)
      .setPosition(Math.round(p.x),Math.round(p.y)-15).setDepth(Math.round(p.y)+2);
  }
}
