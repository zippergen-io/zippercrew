// Original 32 × 36 drawing-based avatar. The fork feet share the cast's ground
// anchor (16,33); the screen stays registered through every rolling/typing frame.
const C={edge:'#485966',blue:'#7498b0',light:'#abc4d2',shade:'#526e86',
  screen:'#e2e7de',face:'#465865',metal:'#c0c8c4',rubber:'#53575d',amber:'#cba05c'};

function fork(p,x,y){
  const {r}=p;
  r(x,y,1,3,C.edge);r(x+4,y,1,3,C.edge);
  r(x+1,y+2,3,2,C.blue);r(x+1,y+3,3,1,C.edge);
  r(x+2,y+4,1,2,C.metal);r(x+1,y,1,2,C.light);
}

function screen(p,dir,blink){
  const {r}=p,side=dir==='right',back=dir==='up',x=side?9:5,w=side?18:23;
  // Raised fork antenna, rounded monitor housing and two little bezel buttons.
  r(18,4,2,3,C.edge);r(19,3,1,3,C.light);fork(p,17,0);
  r(x+2,6,w-4,13,C.edge);r(x,8,w,9,C.edge);r(x+1,7,w-2,11,C.blue);
  r(x+2,7,w-4,1,C.light);r(x+1,9,1,7,C.light);
  r(x+w-2,9,1,8,C.shade);r(x+3,18,w-6,1,C.shade);
  if(back){
    r(9,9,15,7,C.shade);r(10,9,13,1,C.blue);
    for(let i=0;i<3;i++)r(12,11+i*2,9,1,C.edge);
    r(23,15,2,1,C.metal);return;
  }
  const sx=side?16:7,sw=side?9:19;
  r(sx,9,sw,7,C.screen);r(sx+1,8,sw-2,1,C.screen);r(sx+1,16,sw-2,1,C.screen);
  if(side){
    r(11,10,2,5,C.shade);r(12,10,1,4,C.light);
    if(blink)r(18,11,3,1,C.face);
    else{r(18,11,1,1,C.face);r(19,10,1,1,C.face);r(20,11,1,1,C.face);}
    r(22,11,2,1,C.face);r(19,14,4,1,C.face);r(23,13,1,1,C.face);
  }else{
    // The reference's ^ / — eyes and off-center smile give Otto his identity.
    if(blink)r(10,11,4,1,C.face);
    else{r(10,11,1,2,C.face);r(11,10,2,1,C.face);r(13,11,1,2,C.face);}
    r(19,11,4,1,C.face);
    r(12,14,1,1,C.face);r(13,15,8,1,C.face);r(21,14,1,1,C.face);
  }
  r(x+3,17,1,1,C.metal);r(x+5,17,1,1,C.amber);
}

export function drawOtto(p,dir,frame,{seated=false,blink=false}={}){
  const {r}=p,back=dir==='up',side=dir==='right',rest=seated&&frame>=2;
  // Short wheel struts and two forward-facing lifting forks, not walking legs.
  const baseY=seated&&back?26:30;
  for(const x of [10,20]){
    r(x,26,3,baseY-24,C.edge);r(x+1,27,1,baseY-26,C.metal);
    r(x-1,baseY,5,3,C.rubber);r(x,baseY+1,1,1,C.metal);
    if(frame%2)r(x+2,baseY+1,1,1,C.shade);
    r(side?x:x-2,baseY+2,side?7:5,1,C.blue);
    r(side?x+2:x-2,baseY+1,side?5:3,1,C.light);
  }
  // Rectangular chest, three switches and the little scribbled grille.
  r(10,19,13,9,C.edge);r(11,20,11,7,C.blue);r(11,20,2,6,C.light);
  r(21,20,1,7,C.shade);r(14,19,5,1,C.metal);
  if(back){r(14,21,6,4,C.shade);r(15,22,4,1,C.blue);}
  else{
    r(14,21,2,1,C.metal);
    for(let i=0;i<3;i++)r(17+i*2,21,1,2,i===0?C.amber:C.screen);
    r(16,24,5,2,C.edge);r(17,24,1,1,C.metal);r(19,25,1,1,C.metal);
  }
  // Elbowed arms echo the raised pose without taking up neighboring tiles.
  if(seated&&!rest){
    for(const [x,phase]of [[4,frame%2],[25,1-frame%2]]){
      r(x+1,15,2,8,C.edge);r(x+2,16,1,6,C.light);
      r(x<10?7:22,21,3,2,C.blue);fork(p,x,10+phase);
    }
  }else if(side||(rest&&frame===2)){
    // In profile the far arm rests against the chassis. A wide, rear-facing
    // claw read as a tail; keep only the near hand raised in front of the body.
    r(9,20,2,5,C.shade);r(10,20,1,4,C.blue);
    r(22,21,2,5,C.edge);r(23,21,1,4,C.light);
    r(23,24,5,2,C.edge);r(24,24,4,1,C.blue);
    fork(p,25,19);
  }else{
    for(const [x,elbow]of [[1,6],[26,24]]){
      r(elbow,20,2,4,C.edge);r(elbow,20,1,3,C.light);
      r(elbow<10?7:22,22,3,2,C.blue);
      fork(p,x,(rest?19:16)+(frame===3?1:0));
      r(elbow<10?4:25,21,2,2,C.blue);
    }
  }
  screen(p,rest?(frame===3?'down':'right'):dir,blink);
}
