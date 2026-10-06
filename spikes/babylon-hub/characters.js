import {B,v,node,box,ellipsoid,cylinder,sculpture,tube,material,limb,between} from './geometry.js';
const tau=Math.PI*2;
const mix=(a,b,t)=>a+(b-a)*t;

export function buildCast(stations) {
  const m={ink:material('face ink','#273e45'),cream:material('warm face','#fff0ca'),red:material('vermilion','#e9633b'),teal:material('deep teal','#287a78'),tealDark:material('teal brow','#245a5b'),skin:material('warm skin','#c58b62'),jacket:material('iris overshirt','#696bbb'),gold:material('marigold sleeve','#e4b94f'),hair:material('blue black hair','#303d50'),pants:material('ink trousers','#475365'),shoe:material('chalk shoes','#efe2bc'),paper:material('paper','#eee4c9'),book:material('book cover','#b86747'),metal:material('hand tool','#edd3a2')};
  const people=new Map();
  for(const id of ['human','implementer','reviewer']) {
    const p={id,root:node(id),body:null,phase:'work',ambient:null,route:[],speed:id==='implementer'?1.7:id==='reviewer'?.7:1.12,radius:id==='reviewer'?.82:id==='human'?.42:.48,clock:0,gait:0,walkWeight:0,pose:'observing',station:stations[id],handTargets:[],armParts:[],legs:[],pupils:[],brows:[],blink:0};
    p.root.position.copyFrom(p.station.working);p.root.rotation.y=p.station.rotation;p.body=node(id+' movement',p.root);
    const parent=p.body;
    if(id==='human') {
      sculpture('uneven overshirt',[[.69,.18,.17,0,0],[.74,.35,.23,0,0],[1.05,.36,.25,0,0],[1.42,.29,.23,0,0],[1.5,.14,.17,0,0],[1.53,.02,.02,0,0]],m.jacket,parent);
      box('single jacket panel',[.18,.54,.045],m.gold,parent,v(-.17,1.07,-.23)).rotation.z=-.05;
      p.head=node('Human head',parent,v(0,1.94,0));
      ellipsoid('sculpted human face',[.83,.88,.74],m.skin,p.head,v(0,0,0));
      ellipsoid('nose',[.17,.13,.17],m.skin,p.head,v(0,-.03,-.365));
      for(const s of [-1,1])ellipsoid('ear',[.18,.26,.17],m.skin,p.head,v(s*.41,-.02,0));
      ellipsoid('back hair mass',[.87,.75,.55],m.hair,p.head,v(0,.2,.15));
      // Asymmetric swept volumes: a silhouette authored for this cast, not a portrait.
      sculpture('high listening curl',[[0,.07,.07,0,0],[.13,.28,.25,-.07,0],[.36,.33,.25,-.23,.02],[.56,.23,.16,-.48,.025],[.63,.015,.01,-.63,.025]],m.hair,p.head,v(.18,.21,-.04));
      const bang=ellipsoid('low swept fringe',[.75,.28,.4],m.hair,p.head,v(-.18,.29,-.25));bang.rotation.z=-.43;
      ellipsoid('side curl',[.28,.56,.38],m.hair,p.head,v(.36,.13,0)).rotation.z=.28;
      p.face=node('Human expression',p.head,v(0,0,-.34));
      p.shoulderY=1.34;p.shoulderX=.31;p.armRadius=.095;p.handSize=.21;p.legTop=.79;p.legX=.18;p.faceWidth=.17;
      p.height=2.8;p.phaseOffset=.7;
    } else if(id==='implementer') {
      sculpture('asymmetric maker body',[[.5,.03,.03,0,0],[.59,.31,.23,0,0],[.91,.48,.34,0,0],[1.28,.45,.32,.02,0],[1.53,.34,.27,.01,0],[1.73,.26,.21,-.17,0],[1.91,.20,.12,-.42,.01],[1.95,.001,.001,-.67,.01]],m.red,parent);
      p.head=node('Maker expression pivot',parent,v(0,1.19,-.29));
      p.face=node('Maker face',p.head,v());
      ellipsoid('maker cream face',[.73,.68,.18],m.cream,p.face,v(0,0,-.025));
      p.shoulderY=1.03;p.shoulderX=.44;p.armRadius=.049;p.handSize=.2;p.legTop=.66;p.legX=.22;p.faceWidth=.16;
      p.height=2.04;p.phaseOffset=2.2;
    } else {
      sculpture('grounded reviewer mantle',[[.28,.02,.02,0,0],[.34,.57,.38,0,0],[.58,.78,.5,0,.04],[.99,.83,.56,0,.04],[1.39,.65,.48,0,.04],[1.72,.45,.36,0,.07],[1.88,.20,.2,0,.09],[1.93,.001,.001,0,.1]],m.teal,parent);
      p.head=node('Reviewer expression pivot',parent,v(0,1.37,-.425));
      p.face=node('Reviewer face',p.head,v());
      ellipsoid('reviewer pale face',[.92,.7,.21],m.cream,p.face,v(0,0,-.03));
      // A single warm neckline connects the broad silhouette to the book.
      tube('soft rust collar',[[-.48,1.31,-.39],[-.4,1.06,-.54],[0,.96,-.59],[.4,1.06,-.54],[.48,1.31,-.39]],.045,m.book,parent);
      p.shoulderY=1.18;p.shoulderX=.66;p.armRadius=.14;p.handSize=.25;p.legTop=.43;p.legX=.43;p.faceWidth=.2;
      p.height=2.02;p.phaseOffset=4.6;
    }
    const dark=id==='reviewer'?m.tealDark:m.ink;
    for(const s of [-1,1]) {
      const eye=node('eye blink',p.face,v(s*p.faceWidth,.04,-.14));
      const pupil=ellipsoid('eye',[id==='human'?.09:.085,.14,.05],dark,eye);
      if(id==='human') {
        const white=ellipsoid('eye white',[.15,.19,.055],m.cream,eye,v(0,0,.018));white.renderingGroupId=0;
        pupil.position.z=-.021;pupil.position.x=.012;
      }
      p.pupils.push(eye);
      const brow=ellipsoid('expressive eyebrow',[id==='reviewer'?.25:.19,id==='reviewer'?.075:.055,.055],dark,p.face,v(s*p.faceWidth,.235,-.135));
      brow.rotation.z=s*(id==='reviewer'?.06:-.12);p.brows.push(brow);
    }
    tube('small smile',[[-.09,-.15,-.135],[0,-.17,-.15],[.09,-.145,-.135]],.014,dark,p.face);
    for(const s of [-1,1]) {
      const armColor=id==='human'?(s===1?m.gold:m.jacket):id==='implementer'?m.ink:m.teal;
      const handColor=id==='human'?m.skin:id==='implementer'?m.red:m.teal;
      const upper=limb('upper arm',p.armRadius,armColor,parent),lower=limb('forearm',p.armRadius*.85,armColor,parent);
      const elbow=ellipsoid('elbow',[p.armRadius*2,p.armRadius*2,p.armRadius*2],armColor,parent);
      const hand=node('expressive hand',parent);
      ellipsoid('mitten',[p.handSize,p.handSize*1.16,p.handSize*.86],handColor,hand);
      ellipsoid('thumb',[p.handSize*.45,p.handSize*.65,p.handSize*.5],handColor,hand,v(-s*p.handSize*.4,.02,-.03));
      p.armParts.push({s,upper,lower,elbow,hand});p.handTargets.push(v(s*(p.shoulderX+.06),p.shoulderY-.42,-.13));
      const thigh=limb('leg',id==='human'?.11:id==='reviewer'?.15:.048,id==='human'?m.pants:id==='implementer'?m.ink:m.teal,parent);
      const calf=limb('shin',id==='human'?.1:id==='reviewer'?.13:.045,id==='human'?m.pants:id==='implementer'?m.ink:m.teal,parent);
      const foot=ellipsoid('shoe',[id==='reviewer'?.38:.29,.18,id==='reviewer'?.43:.4],id==='human'?m.shoe:id==='implementer'?m.red:m.teal,parent,v(s*p.legX,.1,-.09));
      p.legs.push({s,thigh,calf,foot});
    }
    p.prop=node('held object',parent);p.prop.rotation.x=.25;
    if(id==='reviewer'||id==='human') {
      const w=id==='reviewer'?.74:.4,h=id==='reviewer'?.5:.49;
      box('book cover',[w+.05,h+.035,.075],id==='reviewer'?m.book:m.gold,p.prop);
      box('book pages',[w,h,.035],m.paper,p.prop,v(0,0,-.046));
      box('book spine',[.035,h+.035,.1],id==='reviewer'?m.book:m.gold,p.prop,v(-w/2,0,0));
      for(let i=0;i<3;i++)box('page mark',[w*.62,.013,.006],m.book,p.prop,v(0,h*.23-i*.08,-.068));
    }else {
      const ring=B.MeshBuilder.CreateTorus('small test object',{diameter:.21,thickness:.055,tessellation:12});ring.material=m.metal;ring.parent=p.prop;ring.rotation.x=Math.PI/2;
    }
    p.cup=node('held cup',parent);cylinder('cup',.17,.2,m.cream,p.cup);p.cup.setEnabled(false);
    p.root.getChildMeshes().forEach(mesh=>mesh.metadata={person:id});people.set(id,p);
  }
  return people;
}

export function animateCharacter(p,dt,time) {
  p.clock+=dt;
  const t=time+p.phaseOffset,walking=p.route.length>0;
  const smooth=1-Math.exp(-dt*(p.id==='reviewer'?5:10));
  p.walkWeight=mix(p.walkWeight,walking?1:0,smooth);
  p.gait+=dt*(p.id==='implementer'?12:p.id==='reviewer'?5:7.5)*(walking?1:.3);
  const gait=Math.sin(p.gait),stride=p.id==='reviewer'?.18:.28;
  p.body.position.y=Math.abs(gait)*.045*p.walkWeight+Math.sin(t*1.5)*.008;
  p.body.rotation.z=Math.sin(t*(p.id==='reviewer'?.65:1.1))*.015+gait*.025*p.walkWeight;
  p.head.rotation.y=Math.sin(t*.65)*.075;p.head.rotation.z=Math.sin(t*.48)*.035;
  p.head.rotation.x=0;
  const beat=(p.clock%(p.id==='reviewer'?15:12));
  const work=p.phase==='work'||p.phase==='reviewing';
  let targets=[v(-p.shoulderX-.05,p.shoulderY-.4,-.1),v(p.shoulderX+.05,p.shoulderY-.4,-.1)];
  let propVisible=false,propPos=v(),propAngle=.25;
  p.pose=walking?'walking':'idle';
  if(!walking&&work) {
    if(p.id==='implementer') {
      if(beat<4.4) {
        p.pose='typing';targets=[v(-.38,1.09+Math.sin(t*17)*.025,-1),v(-.05,1.09+Math.cos(t*19)*.025,-1)];p.head.rotation.x=.1;p.head.rotation.y=0;
      }else if(beat<7) {
        p.pose='inspecting tool';targets=[v(-.44,.8,-.3),v(.43,1.35,-.49)];propVisible=true;propPos=targets[1].add(v(0,.13,-.03));p.head.rotation.y=-.2;
      }else if(beat<9) {
        p.pose='checking result';targets=[v(-.26,1.07,-.68),v(.23,1.2,-.58)];p.head.rotation.z=-.12;
      }else {
        p.pose='small reaction';targets=[v(-.44,1.27,-.4),v(.49,1.2,-.4)];p.body.position.y+=Math.sin((beat-9)*Math.PI)*.035;
      }
    }else if(p.id==='reviewer') {
      propVisible=true;propPos=v(0,1.08,-.82);propAngle=.32;
      targets=[v(-.38,1.04,-.83),v(.39,1.04,-.83)];
      if(beat<6){p.pose='reading';p.head.rotation.x=.075;p.head.rotation.y=Math.sin(t*.6)*.08;}
      else if(beat<9){p.pose='turning page';targets[1]=v(.05+Math.sin((beat-6)*1.04)*.3,1.25,-.86);propAngle=.25+Math.sin(t)*.07;}
      else if(beat<12){p.pose='considering';targets[1]=v(.17,1.26,-.68);p.head.rotation.z=-.08;}
      else {p.pose='annotating';targets[1]=v(.09+Math.sin(t*3)*.035,1.16,-.89);}
    }else {
      propVisible=true;propPos=v(-.38,1.03,-.36);propAngle=-.1;
      targets=[v(-.38,.87,-.35),v(.48,.94,-.22)];
      if(beat<4){p.pose='listening';p.head.rotation.y=-.16;p.head.rotation.z=.08;}
      else if(beat<7){p.pose='checking notes';p.head.rotation.x=.2;targets[1]=v(.02,1.06,-.51);}
      else {p.pose='orchestrating';targets[1]=v(.66,1.28+Math.sin(t*1.9)*.09,-.4);p.head.rotation.y=-.2;}
    }
  }
  if(!walking&&p.ambient) {
    if(p.ambient==='coffee'){p.pose='coffee';targets[1]=v(.18,1.3+Math.sin(t*.9)*.08,-.51);}
    if(p.ambient==='window'){p.pose='looking outside';p.head.rotation.y=Math.sin(t*.4)*.17;targets[1]=v(.4,p.shoulderY-.25,-.25);}
    if(p.ambient==='inspect'){p.pose='inspecting brief';p.head.rotation.x=.13;targets[0]=v(-.3,p.shoulderY-.12,-.5);}
  }
  if(p.phase==='attention'&&!walking){p.pose='attentive';targets[0]=v(-.4,.89,-.4);targets[1]=v(.57,1.64,-.38);p.head.rotation.z=-.06;propVisible=true;propPos=v(-.4,1.05,-.4);}
  // Resolve the authored station look target in the character's actual local
  // orientation. Micro-glances are layered on top, rather than replacing it.
  if(!walking&&p.destination?.lookTarget) {
    const delta=p.destination.lookTarget.subtract(p.root.position);
    const worldYaw=Math.atan2(-delta.x,-delta.z),relative=worldYaw-p.root.rotation.y;
    p.head.rotation.y+=Math.max(-.28,Math.min(.28,Math.atan2(Math.sin(relative),Math.cos(relative))));
  }
  p.cup.setEnabled(p.ambient==='coffee'&&!walking);
  for(let i=0;i<2;i++) {
    const a=p.armParts[i],s=a.s;
    const walkingHand=v(s*(p.shoulderX+.06),p.shoulderY-.38,Math.sin(p.gait+s)*.29);
    const desired=B.Vector3.Lerp(targets[i],walkingHand,p.walkWeight);
    p.handTargets[i]=B.Vector3.Lerp(p.handTargets[i],desired,smooth);
    const hand=p.handTargets[i],shoulder=v(s*p.shoulderX,p.shoulderY,0);
    const elbow=shoulder.add(hand).scale(.5).add(v(s*.12,-.12,.1));
    between(a.upper,shoulder,elbow);between(a.lower,elbow,hand);a.elbow.position.copyFrom(elbow);a.hand.position.copyFrom(hand);
    a.hand.rotation.z=s*(p.pose==='orchestrating'?.65:.1);
    const leg=p.legs[i],swing=Math.sin(p.gait+(s===1?Math.PI:0));
    const foot=v(s*p.legX,.1+Math.max(0,swing)*.09*p.walkWeight,-.09+swing*stride*p.walkWeight);
    const knee=v(s*p.legX,p.legTop*.48,-.015+swing*stride*.5*p.walkWeight);
    between(leg.thigh,v(s*p.legX,p.legTop,0),knee);between(leg.calf,knee,foot);leg.foot.position.copyFrom(foot);
  }
  p.cup.position.copyFrom(p.handTargets[1].add(v(0,.11,-.025)));
  p.prop.setEnabled(propVisible&&!walking);p.prop.position=B.Vector3.Lerp(p.prop.position,propPos,smooth);p.prop.rotation.x=mix(p.prop.rotation.x,propAngle,smooth);
  const blinkPhase=(t%(4.3+p.phaseOffset*.17));const blink=blinkPhase<.14?Math.max(.08,Math.abs(blinkPhase-.07)/.07):1;
  for(const eye of p.pupils)eye.scaling.y=blink;
  p.brows.forEach((b,i)=>{b.rotation.z=(i===0?1:-1)*(.08+Math.sin(t*.8)*.06);b.position.y=.235+(p.phase==='attention'?.05:Math.sin(t*.65)*.008);});
}
