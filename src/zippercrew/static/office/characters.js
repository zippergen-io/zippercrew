// Original 32 × 36 office cast. Shared by the live client and the art preview.
// Head registration is independent of gait. Hips remain (16,25), feet (16,33).
// Role accents occupy details, while silhouette and clothes carry the identity.
export const CHARACTER_DESIGNS = {
  planner: {
    skin:'#e6b58b', skinShade:'#bc835f', hair:'#754936', hairLight:'#a16c4b',
    cloth:'#8098a5', light:'#a9bbc2', shade:'#5e7481', inner:'#eee4d4',
    pants:'#626774', pantsLight:'#858c98', shoe:'#59473e', sole:'#aa8a70',
  },
  worker: {
    skin:'#b77e5a', skinShade:'#885b45', hair:'#3d3531', hairLight:'#665045',
    cloth:'#70818a', light:'#98a6aa', shade:'#53626c', inner:'#ded7c8',
    pants:'#515d6d', pantsLight:'#747f8e', shoe:'#51545a', sole:'#ddd8cc',
  },
  reviewer: {
    skin:'#edc3a0', skinShade:'#c49572', hair:'#66616a', hairLight:'#b8b6b1',
    cloth:'#b17e73', light:'#d3a192', shade:'#895e5b', inner:'#e7decc',
    pants:'#63616b', pantsLight:'#8b858c', shoe:'#584841', sole:'#ae9785',
  },
  human: {
    skin:'#dba480', skinShade:'#b77957', hair:'#493c32', hairLight:'#7b5d43',
    cloth:'#c7b89b', light:'#e8dcc5', shade:'#998a75', inner:'#f0e6d5',
    pants:'#70808d', pantsLight:'#9ba5ad', shoe:'#dcd7cc', sole:'#847d74',
  },
};

const INK='#574f4b', EYE='#403b39';

function shadow(p,seated){
  p.r(9,seated?32:31,16,3,'#473a3124');
  p.r(11,32,12,2,'#41383025');
}

function legs(p,s,id,step,seated){
  const {r}=p;
  if(seated){
    // Bent knees share a fixed hip contact; the chair lip covers their top edge.
    r(9,24,7,5,s.pants);r(17,24,7,5,s.pants);
    r(10,25,4,2,s.pantsLight);r(18,25,4,2,s.pantsLight);
    r(10,28,4,4,s.pants);r(21,28,3,4,s.pants);
    r(8,31,7,2,s.shoe);r(20,31,6,2,s.shoe);
    r(9,31,3,1,s.sole);r(21,31,3,1,s.sole);
    return;
  }
  const relaxed=id==='human',width=relaxed?5:4;
  r(11,25,width,7+step,s.pants);r(18,25,width,7-step,s.pants);
  r(12,26,relaxed?3:2,4+step,s.pantsLight);r(19,26,relaxed?3:2,4-step,s.pantsLight);
  r(10,31+step,6,2,s.shoe);r(18,31-step,6,2,s.shoe);
  r(11,32+step,4,1,s.sole);r(19,32-step,4,1,s.sole);
  if(id==='worker'){r(12,30+step,2,1,s.inner);r(19,30-step,2,1,s.inner);}
}

function body(p,s,id,dir){
  const {r}=p,back=dir==='up',side=dir==='right';
  if(id==='planner'){
    // A long, slightly flared jacket; white blouse and two separate hem panels.
    r(12,17,9,9,INK);r(11,23,11,4,INK);
    r(12,18,9,8,s.cloth);r(12,24,9,3,s.cloth);
    r(12,18,2,7,s.light);r(20,19,1,7,s.shade);
    if(back){r(13,18,7,1,s.light);r(16,21,1,5,s.shade);}
    else if(side){r(20,18,1,6,s.inner);r(18,18,2,2,s.light);}
    else{
      r(15,17,3,8,s.inner);r(13,18,2,3,s.light);r(18,18,2,3,s.light);
      r(15,25,3,2,s.pants);r(19,22,1,1,s.shade);
    }
  }else if(id==='worker'){
    // Boxier shoulders, open chore shirt, contrasting yoke and an offset pocket.
    r(10,17,13,9,INK);r(11,17,11,8,s.cloth);r(11,18,3,6,s.light);
    r(21,19,1,6,s.shade);r(11,25,11,1,s.shade);
    if(back){r(12,18,9,1,s.light);r(13,20,7,1,s.shade);r(20,22,2,2,'worker');}
    else if(side){r(20,18,2,6,s.inner);r(18,20,2,3,'worker');r(18,20,2,1,s.light);}
    else{
      r(15,17,4,8,s.inner);r(13,17,2,2,s.light);r(19,17,2,2,s.light);
      r(11,20,3,3,'worker');r(11,20,3,1,s.light);r(20,21,1,1,s.sole);
    }
  }else if(id==='reviewer'){
    // Narrow coral vest over a pale shirt, with a crisp collar and tiny buttons.
    r(12,17,9,9,INK);r(12,17,9,8,s.inner);r(13,18,7,7,s.cloth);
    r(13,19,2,5,s.light);r(19,20,1,5,s.shade);r(12,25,9,1,s.shade);
    if(back){r(14,18,5,1,s.light);r(14,23,5,1,s.shade);}
    else if(side){r(20,18,1,6,s.inner);r(19,20,1,1,s.sole);}
    else{r(15,17,3,2,s.inner);r(16,19,1,1,s.inner);r(17,21,1,1,s.inner);r(17,23,1,1,s.shade);}
  }else{
    // A soft, untucked knit: dropped shoulder, wide hem, amber ribbed cuffs.
    r(10,18,13,8,INK);r(11,18,11,8,s.cloth);r(12,17,9,2,s.cloth);
    r(11,19,3,5,s.light);r(21,20,1,5,s.shade);
    r(11,24,11,2,s.shade);r(12,24,9,1,s.light);
    if(back){r(14,18,5,1,'human');r(14,20,6,1,s.light);}
    else{
      r(side?19:14,17,side?2:5,2,s.inner);
      r(side?18:13,18,side?2:7,1,'human');r(14,21,6,1,s.light);
    }
  }
}

function arms(p,s,id,dir,step,seated,rest=false){
  const {r}=p,back=dir==='up',side=dir==='right';
  const sleeve=id==='reviewer'?s.inner:s.cloth;
  if(seated){
    if(rest){
      // Hands at the chair arms; head, torso and hip registration never shift.
      r(8,19,4,5,s.shade);r(21,19,4,5,s.shade);
      r(9,19,3,4,sleeve);r(21,19,3,4,sleeve);
      r(9,24,3,2,s.skin);r(22,24,3,2,s.skin);return;
    }
    // Quiet desk posture. Only fingers move; neither face nor torso bobs.
    r(8,19,4,4,s.shade);r(21,19,4,4,s.shade);
    r(9,19,3,3,sleeve);r(21,19,3,3,sleeve);
    r(9,21+step,3,2,s.skin);r(22,21-step,3,2,s.skin);
    r(9,20,3,1,id==='human'?'human':s.light);
    return;
  }
  const broad=id==='worker',left=broad?7:8;
  // A pocket hand for You, a notebook arm for Mira, a folded reading arm for Jules.
  const leftStep=id==='planner'||id==='reviewer'?0:step;
  const rightStep=id==='human'?0:-step;
  r(left,18+leftStep,4,7,s.shade);r(left+1,18+leftStep,3,5,sleeve);
  r(left+1,23+leftStep,3,3,s.skin);
  r(22,18+rightStep,broad?4:3,7,s.shade);r(21,18+rightStep,broad?4:3,5,sleeve);
  r(22,23+rightStep,3,3,s.skin);
  const cuff=id==='human'?'human':id==='worker'?s.inner:s.light;
  r(left+1,22+leftStep,3,1,cuff);r(22,22+rightStep,3,1,cuff);
  if(id==='worker'){
    // Rolled sleeves expose the forearms and keep the broad shape readable.
    r(8,22+step,3,2,s.inner);r(23,22-step,2,2,s.inner);
    r(8,24+step,3,2,s.skin);r(23,24-step,2,2,s.skin);
  }else if(id==='planner'){
    // Slim blue notebook under one arm, with an ivory page edge and amber tab.
    const x=side?20:8;
    r(x,20,5,7,s.shade);r(x+1,20,3,6,'planner');r(x+3,21,1,5,s.inner);
    r(x+1,19,2,1,'#d2a34f');r(x,22,2,2,s.skin);
    if(back)r(11,19,1,5,s.light);
  }else if(id==='reviewer'){
    // One sheet held close to the body; the coral pencil is only three pixels.
    const x=side?20:9;
    r(x,21,5,5,'#b0a18c');r(x+1,21,3,4,s.inner);
    r(x+1,22,2,1,'#8b9296');r(x,23,2,2,s.skin);r(x+3,20,1,3,'reviewer');
  }else{
    r(21,23,3,2,s.shade);r(21,23,2,1,s.skin); // tucked hand
    r(9,22+step,2,1,INK);r(9,22+step,1,1,'human'); // small watch
  }
}

function head(p,s,id,dir,blink){
  const {r}=p,back=dir==='up',side=dir==='right';
  r(14,14,5,4,s.skinShade);r(15,15,3,2,s.skin);
  r(10,6,13,8,s.skinShade);r(11,6,11,8,s.skin);r(12,14,9,1,s.skin);
  r(14,15,5,1,s.skinShade);
  if(side){r(22,11,2,2,s.skin);r(22,13,1,1,s.skinShade);r(12,11,2,3,s.skinShade);}
  else{r(9,10,2,3,s.skin);r(22,10,2,3,s.skinShade);}

  // Distinct hair masses rather than palette-swapped caps. No per-frame jitter.
  if(id==='planner'){
    r(11,4,11,3,s.hair);r(10,5,13,5,s.hair);
    r(9,7,3,10,s.hair);r(21,7,3,10,s.hair);r(10,16,3,2,s.hair);r(20,16,3,2,s.hair);
    r(11,5,7,2,s.hairLight);r(10,8,1,7,s.hairLight);
    if(back){r(11,8,11,9,s.hair);r(12,8,2,7,s.hairLight);r(14,16,7,1,s.hairLight);}
    else if(side){r(10,7,7,8,s.hair);r(12,7,2,7,s.hairLight);r(17,7,4,1,s.hair);}
    else{r(12,7,6,1,s.hair);r(12,8,3,1,s.hair);}
    r(back?21:side?14:21,9,2,1,'planner'); // understated hair slide
  }else if(id==='worker'){
    for(const [x,y,w,h] of [[10,4,4,4],[14,3,5,4],[19,4,4,4],[9,6,4,4],[21,6,3,4]])r(x,y,w,h,s.hair);
    r(11,6,12,3,s.hair);r(10,9,2,2,s.hair);r(21,9,2,2,s.hair);
    r(11,5,2,1,s.hairLight);r(16,4,2,1,s.hairLight);r(20,6,2,1,s.hairLight);
    if(back){r(10,8,13,6,s.hair);r(12,13,9,2,s.hair);r(11,9,2,2,s.hairLight);r(20,11,2,1,s.hairLight);}
    else if(side){r(10,8,5,6,s.hair);r(11,9,2,2,s.hairLight);r(15,13,2,1,s.hair);}
    else{r(12,14,2,1,s.hair);r(19,14,2,1,s.hair);r(14,15,5,1,s.hair);}
  }else if(id==='reviewer'){
    // Angular crop with a silver sweep, short temple and a clean nape.
    r(12,3,8,2,s.hair);r(10,5,12,3,s.hair);r(9,7,4,4,s.hair);
    r(11,4,5,2,s.hairLight);r(10,6,7,2,s.hairLight);r(10,8,3,1,s.hairLight);
    r(21,7,2,3,s.hair);r(21,9,1,2,s.hairLight);
    if(back){r(10,8,13,5,s.hair);r(12,13,9,2,s.hair);r(10,8,4,3,s.hairLight);r(12,12,2,1,s.hairLight);}
    else if(side){r(10,8,5,5,s.hair);r(11,8,3,3,s.hairLight);}
  }else{
    // A loose, side-parted sweep and a small cowlick; no cap, crown or headset.
    r(12,4,10,3,s.hair);r(14,3,5,2,s.hair);r(11,6,12,3,s.hair);
    r(10,8,3,4,s.hair);r(21,8,2,3,s.hair);
    r(12,5,5,2,s.hairLight);r(11,7,3,2,s.hairLight);r(17,5,3,1,s.hairLight);
    if(back){r(11,8,12,6,s.hair);r(13,14,8,1,s.hair);r(12,8,3,3,s.hairLight);}
    else if(side){r(10,8,6,5,s.hair);r(11,8,3,2,s.hairLight);r(15,8,3,1,s.hair);}
    else{r(12,9,2,1,s.hair);r(15,8,2,1,s.hair);}
  }
  if(back)return;
  // Restrained eyes/nose, identical in walking and idle. Glasses keep their rim
  // during a blink instead of replacing the whole face with a different frame.
  if(id==='reviewer'){
    if(side){r(18,10,5,3,INK);r(19,11,3,1,s.skin);r(15,10,4,1,INK);r(20,11,1,1,blink?s.skinShade:EYE);}
    else{
      r(11,10,5,3,INK);r(18,10,5,3,INK);r(16,11,2,1,INK);
      r(12,11,3,1,s.skin);r(19,11,3,1,s.skin);
      r(13,11,1,1,blink?s.skinShade:EYE);r(20,11,1,1,blink?s.skinShade:EYE);
    }
  }else if(side){
    r(20,blink?12:11,blink?2:1,blink?1:2,blink?s.skinShade:EYE);
  }else{
    r(13,blink?12:11,blink?2:1,blink?1:2,blink?s.skinShade:EYE);
    r(19,blink?12:11,blink?2:1,blink?1:2,blink?s.skinShade:EYE);
  }
  r(side?21:16,14,2,1,s.skinShade);
}

export function drawCharacter(p,person,dir,frame=0,{seated=false,blink=false}={}){
  const id=person.id,s=CHARACTER_DESIGNS[id];
  if(!s)throw new Error(`No character design for ${id}`);
  const step=seated?frame%2:frame===1?-1:frame===3?1:0;
  p.c.save();
  // Mirror about the same central pixel column, keeping head and feet registered.
  if(dir==='left'){p.c.translate(33,0);p.c.scale(-1,1);dir='right';}
  shadow(p,seated);
  legs(p,s,id,step,seated);
  body(p,s,id,seated&&frame>=2?'right':dir);
  arms(p,s,id,dir,step,seated,seated&&frame>=2);
  // A sustained quarter turn away from the monitor marks rest. The second
  // resting pose looks out into the room; neither pose moves the hip anchor.
  head(p,s,id,seated&&frame>=2?(frame===3?'down':'right'):dir,blink);
  if(seated&&frame===3){
    p.r(18,28,5,4,s.pants);p.r(20,30,5,2,s.pantsLight);
    p.r(23,31,5,2,s.shoe);p.r(24,32,4,1,s.sole);
  }
  p.c.restore();
}

export const drawSeatedCharacter=(p,person,dir,frame)=>drawCharacter(p,person,dir,frame,{seated:true});
export const drawBlinkCharacter=(p,person,dir)=>drawCharacter(p,person,dir,0,{blink:true});
