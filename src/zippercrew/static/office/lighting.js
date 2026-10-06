import { WORLD } from './world.js';

const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const surface=(width,height)=>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;return canvas;};

// Pixel-resolution material lighting. A material texture (or the unchanged day
// texture) supplies reflectance; the night texture supplies unlit detail.
// Lights restore that material locally,
// preserving its grain, upholstery, outlines and alpha instead of tinting a room.
export class NightLighting {
  constructor(scene) {
    this.scene=scene;
    this.sources=WORLD.furniture.flatMap(f=>(f.lights||[]).map(light=>({
      ...light,id:`${f.id}:${light.kind}`,owner:f.id,x:f.x+light.x,y:f.y+light.y,
    })));
    this.blockers=WORLD.furniture.filter(f=>['sofa','table','cabinet','shelf'].includes(f.type));
    this.bakeFloor();
  }

  materialKey(key) {
    return this.scene.textures.exists(`material:${key}`)?`material:${key}`:`day:${key}`;
  }

  crosses(source,x,y,box) {
    const [ox,oy,w,h]=box.footprint,bx=box.x+ox,by=box.y+oy;
    if(x>=bx&&x<=bx+w&&y>=by&&y<=by+h)return false;
    let enter=0,leave=1;
    for(const [origin,delta,low,high]of [[source.x,x-source.x,bx,bx+w],[source.y,y-source.y,by,by+h]]){
      if(Math.abs(delta)<.001){if(origin<low||origin>high)return false;}
      else {let a=(low-origin)/delta,b=(high-origin)/delta;if(a>b)[a,b]=[b,a];enter=Math.max(enter,a);leave=Math.min(leave,b);if(enter>leave)return false;}
    }
    return enter>.02&&enter<.98;
  }

  sample(x,y,{floor=false,owner=null}={}) {
    let warm=0,cool=0;
    for(const light of this.sources){
      const dx=(x-light.x)/light.rx,dy=(y-light.y)/light.ry;
      const distance=Math.hypot(dx,dy);
      if(distance>=1||(light.kind==='screen'&&y<light.y-5))continue;
      let power=light.strength*Math.pow(1-distance,1.35);
      if(floor&&light.kind==='lamp'&&this.blockers.some(f=>f.id!==owner&&this.crosses(light,x,y,f)))power*=.68;
      if(light.kind==='screen')cool+=power;else warm+=power;
    }
    // Discrete light values on the native pixel grid; no blur, bloom or filtering.
    return {warm:Math.round(clamp(warm,0,.88)*48)/48,cool:Math.round(clamp(cool,0,.38)*64)/64};
  }

  shade(night,day,index,{warm,cool}) {
    const total=warm+cool,light=clamp(total,0,.92),normalization=total?light/total:0;
    const warmFilter=[1.1,.93,.75],coolFilter=[.86,.98,1.03];
    for(let c=0;c<3;c++){
      const target=normalization*(warm*Math.min(255,day[index+c]*warmFilter[c])+cool*Math.min(255,day[index+c]*coolFilter[c]));
      night[index+c]=Math.round(clamp(night[index+c]*(1-light)+target,0,255));
    }
  }

  bakeFloor() {
    const {width,height,tile,floor,zones}=WORLD;
    const material=mood=>{
      const c=surface(width,height),ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
      const key=name=>mood==='day'?this.materialKey(name):`${mood}:${name}`;
      const tiles=this.scene.textures.get(key('floor-tiles')).getSourceImage();
      for(let y=floor.y;y<floor.y+floor.height;y+=tile)for(let x=floor.x;x<floor.x+floor.width;x+=tile){
        const index=(x/tile+(y/tile%2)*2)%4;
        ctx.drawImage(tiles,index*tile,0,tile,tile,x,y,tile,tile);
      }
      for(const zone of zones)ctx.drawImage(this.scene.textures.get(key(`rug-${zone.id}`)).getSourceImage(),zone.x,zone.y);
      return ctx.getImageData(0,0,width,height);
    };
    const day=material('day'),night=material('night');
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const i=(y*width+x)*4,light=this.sample(x,y,{floor:true});
      if(!night.data[i+3]||(!light.warm&&!light.cool)){night.data[i+3]=0;continue;}
      this.shade(night.data,day.data,i,light);
    }
    const texture=this.scene.textures.get('night:lighting');
    texture.getSourceImage().getContext('2d').putImageData(night,0,0);texture.refresh();
  }

  textureKey(mood,key,x,y) {
    if(mood!=='night'||key.startsWith('rug-')||['lighting','selection','destination'].includes(key))return `${mood}:${key}`;
    const textureKey=`night:lit:${key}:${x}:${y}`;
    if(this.scene.textures.exists(textureKey))return textureKey;
    const original=this.scene.textures.get(`night:${key}`).getSourceImage();
    const c=surface(original.width,original.height),ctx=c.getContext('2d');ctx.drawImage(original,0,0);
    const night=ctx.getImageData(0,0,c.width,c.height);
    ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(this.scene.textures.get(this.materialKey(key)).getSourceImage(),0,0);
    const day=ctx.getImageData(0,0,c.width,c.height);
    for(let py=0;py<c.height;py++)for(let px=0;px<c.width;px++){
      const i=(py*c.width+px)*4;
      if(night.data[i+3]<180)continue; // Contact shadows remain shadows.
      // Sky and the emissive screen faces keep their own colors.
      if(key==='architecture'&&py>=33&&py<57&&((px>=88&&px<168)||(px>=345&&px<425)))continue;
      if(key.startsWith('desk-')&&px>=27&&px<60&&py<19)continue;
      if(key==='desk-1'&&px>=7&&px<22&&py<20)continue;
      if(key==='lamp'&&py<12)continue;
      this.shade(night.data,day.data,i,this.sample(x+px,y+py));
    }
    ctx.putImageData(night,0,0);this.scene.textures.addCanvas(textureKey,c);return textureKey;
  }

  characterKey(person) {
    if(this.scene.mood!=='night')return `day:person-${person.id}`;
    const sample=this.sample(person.x,person.y-15);
    const warm=Math.round(sample.warm*8),cool=Math.round(sample.cool*12);
    if(!warm&&!cool)return `night:person-${person.id}`;
    const key=`night:lit-person:${person.id}:${warm}:${cool}`;
    if(this.scene.textures.exists(key))return key;
    const original=this.scene.textures.get(`night:person-${person.id}`).getSourceImage();
    const c=surface(original.width,original.height),ctx=c.getContext('2d');ctx.drawImage(original,0,0);
    const night=ctx.getImageData(0,0,c.width,c.height);
    ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(this.scene.textures.get(`day:person-${person.id}`).getSourceImage(),0,0);
    const day=ctx.getImageData(0,0,c.width,c.height);
    for(let i=0;i<night.data.length;i+=4)if(night.data[i+3]>180)this.shade(night.data,day.data,i,{warm:warm/8,cool:cool/12});
    ctx.putImageData(night,0,0);
    this.scene.textures.addSpriteSheet(key,c,{frameWidth:32,frameHeight:36});return key;
  }
}
