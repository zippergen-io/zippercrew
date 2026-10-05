/* Fixed Corner Café surfaces. These affect drawing only, never workflow state.
 * Coordinates use the same scene plane as furniture and feet. Canvas-compatible. */
export const BOARD_PLANE = [[947, 83], [1205, 78], [1199, 238], [947, 223]];
export const SHADOW_REGIONS = [
  { name: 'window mullion', alpha: .25, polygon: [[0, 312], [0, 360], [1536, 827], [1536, 769]] },
  { name: 'window return', alpha: .18, polygon: [[0, 564], [0, 632], [720, 1024], [831, 1024]] },
  { name: 'counter recess', alpha: .16, maxFootY: 380, polygon: [[396,90],[790,108],[790,296],[396,285]] },
  { name: 'counter overhang', alpha: .30, polygon: [[396, 285], [790, 296], [865, 403], [470, 397]] },
];
export function inside([x, y], polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [a, b] = polygon[i], [c, d] = polygon[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) hit = !hit;
  }
  return hit;
}
function path(ctx, points) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
}
// A projective map keeps every text baseline straight on the board plane.
export function project(u, v, q = BOARD_PLANE) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = q;
  const dx1=x1-x2, dx2=x3-x2, dx3=x0-x1+x2-x3;
  const dy1=y1-y2, dy2=y3-y2, dy3=y0-y1+y2-y3;
  const det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det;
  const z=g*u+h*v+1;
  return [((x1-x0+g*x1)*u+(x3-x0+h*x3)*v+x0)/z,
    ((y1-y0+g*y1)*u+(y3-y0+h*y3)*v+y0)/z];
}
function triangle(ctx, source, src, dest) {
  const [[x0,y0],[x1,y1],[x2,y2]]=src, [[a0,b0],[a1,b1],[a2,b2]]=dest;
  const d=(x1-x0)*(y2-y0)-(x2-x0)*(y1-y0);
  const a=((a1-a0)*(y2-y0)-(a2-a0)*(y1-y0))/d;
  const c=((x1-x0)*(a2-a0)-(x2-x0)*(a1-a0))/d;
  const b=((b1-b0)*(y2-y0)-(b2-b0)*(y1-y0))/d;
  const e=((x1-x0)*(b2-b0)-(x2-x0)*(b1-b0))/d;
  ctx.save(); path(ctx,dest); ctx.clip(); ctx.transform(a,b,c,e,a0-a*x0-c*y0,b0-b*x0-e*y0);
  ctx.drawImage(source,0,0); ctx.restore();
}
export class ChalkBrief {
  constructor(scene) {
    this.texture=scene.textures.createCanvas('chalk-brief', 280*2, 180*2);
    this.image=scene.add.image(938,70,'chalk-brief').setOrigin(0).setScale(.5).setDepth(2);
    this.paper=document.createElement('canvas'); this.paper.width=640; this.paper.height=360;
  }
  setText(text) {
    if (this.text===text) return;
    this.text=text;
    const c=this.paper.getContext('2d'); c.clearRect(0,0,640,360);
    c.fillStyle='#e9e5ce'; c.font='30px "Chalkboard SE", "Chalkboard", cursive';
    c.fillText('SHARED BRIEF',35,50);
    c.globalAlpha=.45; c.fillRect(35,65,180,2); c.globalAlpha=1;
    c.font='38px "Chalkboard SE", "Chalkboard", cursive';
    const words=(text || 'What are we working on?').replace(/\s+/g,' ').slice(0,180).split(' ');
    let line='', y=116;
    for (const word of words) {
      if (c.measureText(line+word).width>555 && line) {
        c.fillText(line.trim(),35,y); y+=49; line='';
        if (y>275) { line='…'; break; }
      }
      line+=word+' ';
    }
    c.fillText(line.trim(),35,y);
    // Stable fine chalk grain; no animated noise and no dependence on random time.
    c.globalCompositeOperation='destination-out';
    for(let i=0;i<6500;i++) {
      c.fillStyle=`rgba(0,0,0,${.12+(i%5)*.07})`;
      c.fillRect((i*137.31)%640,(i*53.79)%360,.7+(i%3)*.35,.8);
    }
    c.globalCompositeOperation='source-over';
    const out=this.texture.context; out.clearRect(0,0,560,360);
    const point=(u,v)=>project(u,v).map((n,i)=>(n-[938,70][i])*2);
    // Fine mesh avoids the diagonal discontinuity of a two-triangle affine warp.
    for(let row=0;row<8;row++) for(let col=0;col<12;col++) {
      const uv=[[col/12,row/8],[(col+1)/12,row/8],[(col+1)/12,(row+1)/8],[col/12,(row+1)/8]];
      for(const indices of [[0,1,2],[0,2,3]]) triangle(out,this.paper,
        indices.map(i=>[uv[i][0]*640,uv[i][1]*360]),indices.map(i=>point(...uv[i])));
    }
    this.texture.refresh();
  }
}
export class RoomLighting {
  constructor(scene, roles) {
    this.scene=scene;
    this.regions=[...SHADOW_REGIONS, ...roles.filter(r=>r.name!=='Human').map(r=>({
      name:`${r.name} desk`, alpha:.26,
      polygon:[[r.desk.x-145,r.desk.y-145],[r.desk.x+60,r.desk.y-240],
        [r.desk.x+180,r.desk.y-35],[r.desk.x-30,r.desk.y+40]],
    }))];
    const floor=scene.textures.createCanvas('furniture-shadows',1536,1024), fc=floor.context;
    for (const role of roles) {
      fc.save(); fc.fillStyle='rgba(38,32,28,.16)'; fc.filter='blur(9px)';
      const {x,y}=role.desk;
      if(role.name==='Human') { fc.beginPath(); fc.ellipse(x+35,y-4,145,33,.25,0,Math.PI*2); }
      else path(fc,[[x-150,y-75],[x+70,y-170],[x+155,y-10],[x-60,y+35]]);
      fc.fill(); fc.restore();
    }
    floor.refresh(); scene.add.image(0,0,'furniture-shadows').setOrigin(0).setDepth(-910);
    const texture=scene.textures.createCanvas('contact-shadow',256,128), c=texture.context;
    const gradient=c.createRadialGradient(128,64,5,128,64,120);
    gradient.addColorStop(0,'rgba(29,27,25,.48)'); gradient.addColorStop(.35,'rgba(29,27,25,.25)');
    gradient.addColorStop(1,'rgba(29,27,25,0)'); c.fillStyle=gradient;
    c.fillRect(0,0,256,128); texture.refresh();
    // Reuse the exact counter artwork as a foreground occluder, not a redraw.
    // Its foot plane is y=365. A person behind it is hidden by the counter front.
    const counter=scene.textures.createCanvas('counter-front',420,180), cc=counter.context;
    cc.save(); path(cc,[[3,32],[374,45],[401,17],[401,165],[374,175],[3,158]]); cc.clip();
    cc.drawImage(scene.textures.get('cafe').getSourceImage(),390,190,420,180,0,0,420,180);
    cc.restore(); counter.refresh();
    scene.add.image(390,190,'counter-front').setOrigin(0).setDepth(365);
  }
  attach(person) {
    const {scene}=this, {sprite,role}=person;
    person.shadow=scene.add.image(sprite.x,sprite.y,'contact-shadow').setDisplaySize(150,38).setDepth(-900);
    person.castShadow=scene.add.image(sprite.x+48,sprite.y+12,'contact-shadow')
      .setDisplaySize(240,40).setAngle(22).setAlpha(.55).setDepth(-901);
    person.lightTexture=scene.textures.createCanvas(`received-${role.key}`,1,1);
    person.receivedShadow=scene.add.image(sprite.x,sprite.y,`received-${role.key}`).setOrigin(.5,1);
  }
  update(person) {
    const {sprite:s,shadow,castShadow,receivedShadow:overlay,lightTexture:t}=person;
    const seated=s.frame.name==='work', visible=s.visible;
    shadow.setVisible(visible).setPosition(s.x,s.y-3).setDisplaySize(seated?152:135,seated?38:31);
    castShadow.setVisible(visible).setPosition(s.x+46,s.y+13).setDisplaySize(seated?195:235,37);
    overlay.setVisible(visible).setPosition(s.x,s.y).setScale(s.scaleX,s.scaleY)
      .setAngle(s.angle).setFlipX(s.flipX).setAlpha(s.alpha).setDepth(s.depth+.01);
    if(!visible) return;
    const f=s.frame, key=[f.name,s.x.toFixed(1),s.y.toFixed(1),s.angle.toFixed(2),s.scaleX,s.scaleY,s.flipX].join(':');
    if(key===person.lightKey) return;
    person.lightKey=key;
    if(t.width!==f.width||t.height!==f.height) { t.setSize(f.width,f.height); overlay.setTexture(t.key); }
    const c=t.context; c.clearRect(0,0,t.width,t.height);
    const matrix=s.getWorldTransformMatrix();
    const local=([x,y])=>{
      const p=matrix.applyInverse(x,y); return [(s.flipX?-p.x:p.x)+f.width/2,p.y+f.height];
    };
    for(const region of this.regions) {
      if(region.maxFootY && s.y>region.maxFootY) continue;
      c.save(); c.fillStyle=`rgba(31,39,52,${region.alpha})`;
      c.shadowColor=c.fillStyle; c.shadowBlur=5;
      path(c,region.polygon.map(local)); c.fill(); c.restore();
    }
    c.globalCompositeOperation='destination-in';
    c.drawImage(s.texture.getSourceImage(),f.cutX,f.cutY,f.width,f.height,0,0,f.width,f.height);
    c.globalCompositeOperation='source-over'; t.refresh();
    person.shadowRegions=this.regions.filter(r=>r.polygon.some(([x,y])=>Math.abs(x-s.x)<400&&Math.abs(y-s.y)<400)).map(r=>r.name);
  }
}
