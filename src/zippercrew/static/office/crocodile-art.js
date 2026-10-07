// Original pixel interpretation of the user's upright, three-quarter pencil sketch.
// Every pose keeps the same oversized muzzle, two eyes, round belly and tiny arms.
// 32×36 cells and the shared foot anchor retain the office's native pixel scale
// and local night lighting. Nothing is stretched or downsampled at runtime.
const PALETTES={
  day:{outline:'#626553',skin:'#929f78',light:'#b1ba90',shade:'#788764',belly:'#ded0a9',stripe:'#b1a27d',eye:'#344038',tooth:'#f5ecda'},
  night:{outline:'#414b43',skin:'#66765f',light:'#859276',shade:'#526552',belly:'#a6997d',stripe:'#807b62',eye:'#293731',tooth:'#c7bfaa'},
};

function drawPose(ctx,p,frame){
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=p[color]||color;ctx.fillRect(x,y,w,h);};
  // Rasterize silhouettes directly into integer pixels, with a one-pixel contour.
  // This avoids anti-aliased canvas paths, even on the snout's rounded corners.
  const shape=(points,color,outline=true)=>{
    const pixels=[];
    for(let y=0;y<34;y++)for(let x=0;x<32;x++){
      let inside=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const [ax,ay]=points[i],[bx,by]=points[j];
        if((ay>y+.5)!==(by>y+.5)&&x+.5<(bx-ax)*(y+.5-ay)/(by-ay)+ax)inside=!inside;
      }
      if(inside)pixels.push([x,y]);
    }
    if(outline)for(const [x,y]of pixels)for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]])rect(x+dx,y+dy,1,1,'outline');
    for(const [x,y]of pixels)rect(x,y,1,1,color);
  };
  const blink=frame===1||frame===5;
  const stepLeft=frame===3?1:0,stepRight=frame===4?1:0;

  rect(9,32,17,2,'#403c3533');rect(12,34,11,1,'#403c351a');
  // The rising tail completes a soft Z from muzzle, through belly, to tip.
  shape([[21,28],[25,28],[28,25],[30,19],[30,26],[27,30],[22,31]],'skin');
  shape([[25,27],[26,24],[28,27]],'shade');
  rect(27,28,1,2,'stripe');rect(24,29,1,2,'stripe');
  // Small triangular dorsal plates, well separated from the tiny forearms.
  for(const y of [16,21,26])shape([[22,y],[26,y+1],[23,y+3]],'shade');
  // Hind legs only; none of the resting frames becomes a low quadruped.
  shape([[10,29],[14,29],[14,32-stepLeft],[8,32-stepLeft]],'skin');
  shape([[20,29],[24,30],[25,32-stepRight],[20,32-stepRight]],'skin');
  rect(9,31-stepLeft,2,1,'belly');rect(22,31-stepRight,2,1,'belly');
  shape([[15,14],[21,15],[23,20],[24,27],[22,31],[13,31],[10,28],[11,21]],'skin');
  shape([[14,17],[19,18],[20,23],[20,28],[18,31],[13,31],[11,28],[12,22]],'belly',false);
  for(const [x,y,w]of [[12,22,7],[12,26,8],[13,29,6]])rect(x,y,w,1,'stripe');
  rect(21,21,1,7,'shade');
  // Tiny dangling arms/hands, as in the sketch, rather than front legs.
  shape([[11,22],[10,24],[9,24],[9,26],[12,26],[13,23]],'skin');
  rect(10,25,1,1,'light');
  shape([[22,22],[22,25],[20,27],[18,26],[20,24]],'skin');
  rect(19,25,1,1,'light');

  // Rounded eye lobes are asymmetric: a friendly three-quarter view.
  shape([[11,3],[13,2],[16,2],[18,4],[21,4],[24,7],[24,13],[21,18],[15,19],[10,15],[9,8]],'skin');
  shape([[11,4],[13,3],[16,3],[17,5],[14,9],[10,10]],'light',false);
  if(blink){
    rect(12,6,3,1,'outline');rect(19,9,3,1,'outline');
  }else{
    // Dark oval eyes with generous paper-white glints reproduce the drawing.
    shape([[13,4],[15,5],[15,8],[13,9],[12,7],[12,5]],'eye',false);
    rect(13,4,1,2,'tooth');rect(14,7,1,1,'shade');
    shape([[20,6],[22,7],[22,10],[20,11],[19,9],[19,7]],'eye',false);
    rect(20,6,1,2,'tooth');rect(21,9,1,1,'shade');
  }
  // A broad round lower jaw and cream mouth; only three little teeth.
  shape([[4,13],[13,13],[18,14],[19,17],[16,19],[10,19],[6,17]],'belly');
  rect(6,14,9,1,'outline');rect(9,15,6,1,'outline');
  // Big pill-shaped muzzle projects forward, not a narrow dinosaur beak.
  shape([[4,9],[8,8],[12,9],[15,10],[18,12],[17,14],[11,15],[5,14],[2,13],[2,11]],'skin');
  shape([[4,10],[8,9],[12,10],[14,11],[6,11],[3,12]],'light',false);
  rect(4,11,1,1,'eye');rect(9,12,1,1,'eye');
  rect(5,14,1,2,'tooth');rect(10,15,1,2,'tooth');rect(16,14,1,2,'tooth');
  // Soft cheek freckles and a mouth corner, rather than an aggressive grin.
  rect(22,12,1,1,'light');rect(21,14,1,1,'shade');rect(23,14,1,1,'light');
  rect(19,16,1,1,'shade');
  if(frame===2)rect(19,25,2,1,'light'); // A tiny hand uncurls during a peek.
}

export function createCrocodileArt(scene){
  for(const [mood,palette]of Object.entries(PALETTES)){
    const canvas=document.createElement('canvas');canvas.width=32*6;canvas.height=36;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
    // Upright idle, blink, attentive stand, two hind-leg steps, standing blink.
    for(let frame=0;frame<6;frame++){
      ctx.save();ctx.translate(frame*32,0);drawPose(ctx,palette,frame);ctx.restore();
    }
    scene.textures.addSpriteSheet(`${mood}:person-crocodile`,canvas,{frameWidth:32,frameHeight:36});
  }
}
