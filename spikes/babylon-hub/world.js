import {B,v,node,box,ellipsoid,cylinder,pill,material} from './geometry.js';

export function buildWorld(scene) {
  const root=node('Hub'),m={floor:material('warm chalk','#ded9c7'),wall:material('plaster','#eee8d6'),trim:material('window ochre','#e6b550'),blue:material('ink blue','#495d81'),desk:material('pale butter','#ead2a4'),leg:material('muted clay','#bdaf98'),coffee:material('coffee machine','#37474c'),sky:material('sky','#b9d9de'),cup:material('ceramic','#f6ebcd'),dark:material('screen frame','#36444c'),screen:material('screen','#a9c8bb'),line:material('screen marks','#41665e')};
  m.sky.emissiveColor=B.Color3.FromHexString('#94b8c4').scale(.3);
  box('floor',[24,.18,24],m.floor,root,v(0,-.1,0),false);
  // A genuine window opening and a genuine doorway, not painted rectangles.
  box('back wall below window',[6.9,1.15,.24],m.wall,root,v(-2.05,.575,3.55));
  box('back wall above window',[6.9,.75,.24],m.wall,root,v(-2.05,4.175,3.55));
  box('window left pier',[.75,2.7,.24],m.wall,root,v(-5.12,2.5,3.55));
  box('window right pier',[2.0,2.7,.24],m.wall,root,v(.4,2.5,3.55));
  box('door left pier',[1.2,4.55,.25],m.wall,root,v(2,2.275,3.55));
  box('door right pier',[.5,4.55,.25],m.wall,root,v(5.2,2.275,3.55));
  box('door lintel',[2.6,1.2,.25],m.wall,root,v(3.65,3.95,3.55));
  box('upper wall',[11.25,2.5,.25],m.wall,root,v(-.075,5.79,3.55));
  box('left return wall',[.24,7,2.1],m.wall,root,v(-5.55,3.5,2.55));
  box('window reveal left',[.12,2.7,.35],m.trim,root,v(-4.71,2.5,3.45));
  box('window reveal right',[.12,2.7,.35],m.trim,root,v(-.64,2.5,3.45));
  box('window sill',[4.25,.16,.6],m.trim,root,v(-2.68,1.16,3.42));
  box('window top',[4.25,.16,.35],m.trim,root,v(-2.68,3.82,3.45));
  box('outside sky',[10,8,.1],m.sky,root,v(-2,3.5,5.8),false);
  box('door trim left',[.16,3.25,.32],m.blue,root,v(2.7,1.625,3.4));
  box('door trim right',[.16,3.25,.32],m.blue,root,v(4.73,1.625,3.4));
  box('door trim top',[2.2,.16,.32],m.blue,root,v(3.715,3.25,3.4));
  box('future passage floor',[2.3,.12,3],m.leg,root,v(3.7,-.025,4.9));
  box('future passage end',[2.3,3.4,.15],m.blue,root,v(3.7,1.7,6.4));
  // Furniture has broad, intentional contours with no textured detail.
  const desk=node('maker work surface',root,v(-.9,0,-.55));
  pill('maker tabletop',2.1,1.12,.13,m.desk,desk,v(0,.94,0));
  for(const x of [-.79,.79])box('desk support',[.17,.94,.55],m.leg,desk,v(x,.47,.05));
  const laptop=node('laptop',desk,v(.52,1.08,-.1));laptop.rotation.y=.9;
  box('laptop base',[.87,.055,.56],m.dark,laptop,v(0,0,0));
  const lid=node('laptop hinge',laptop,v(0,.025,-.22));lid.rotation.x=-.16;
  box('laptop display',[.87,.56,.055],m.dark,lid,v(0,.27,0));
  box('display light',[.76,.44,.014],m.screen,lid,v(0,.27,.033));
  for(let i=0;i<4;i++)box('observable output line',[.25+(i%2)*.22,.018,.016],m.line,lid,v(-.08,.39-i*.075,.045));
  for(let i=0;i<3;i++)box('keyboard row',[.65,.008,.035],m.leg,laptop,v(0,.035,.02+i*.08));
  // The shared brief has its own walk-up point, outside the circulation route.
  const brief=node('shared brief',root,v(-3.65,0,1));
  pill('brief surface',1.65,1.15,.12,m.desk,brief,v(0,1.05,0));
  cylinder('brief pedestal',.3,1.05,m.blue,brief,v(0,.52,0));
  pill('brief foot',.85,.65,.08,m.blue,brief,v());
  const paper=box('shared task',[.65,.025,.45],m.cup,brief,v(0,1.2,0));paper.rotation.y=-.16;
  const coffee=node('coffee point',root,v(1.12,0,2.98));
  box('coffee base',[1.55,1.02,.75],m.blue,coffee,v(0,.51,0));
  pill('coffee top',1.68,.87,.11,m.desk,coffee,v(0,1.02,0));
  box('coffee machine',[.48,.65,.38],m.coffee,coffee,v(-.35,1.43,.05));
  cylinder('coffee button',.05,.04,m.trim,coffee,v(-.22,1.6,-.17)).rotation.x=Math.PI/2;
  box('coffee spout',[.13,.08,.19],m.coffee,coffee,v(-.33,1.35,-.24));
  cylinder('coffee cup',.18,.22,m.cup,coffee,v(-.33,1.23,-.23));
  cylinder('spare cup',.18,.22,m.cup,coffee,v(.32,1.24,-.05));
  const stool=node('review perch',root,v(4.35,0,.15));
  pill('wide perch',1.55,.82,.18,m.blue,stool,v(0,.44,.04));
  for(const x of [-.53,.53])cylinder('perch foot',.12,.48,m.leg,stool,v(x,.24,.13));
  // Explicit transforms and footprints are renderer-side spatial facts only.
  const stations={
    human:{approach:v(-3.05,0,-1.4),working:v(-3.05,0,-.85),rotation:-.2,lookTarget:v(.65,1.5,-.05)},
    implementer:{approach:v(.8,0,1.2),working:v(.65,0,-.05),rotation:.55,lookTarget:v(-.38,1.4,-.85)},
    reviewer:{approach:v(2.45,0,-1.2),working:v(2.45,0,-.12),rotation:.18,lookTarget:v(2.45,1.3,-.85)},
    coffee:{approach:v(2.2,0,1.65),working:v(1.15,0,1.65),rotation:Math.PI,lookTarget:v(1.1,1.6,2.95)},
    window:{approach:v(-2.2,0,1.7),working:v(-2.7,0,2.65),rotation:Math.PI,lookTarget:v(-2.7,2.2,4)},
    inspect:{approach:v(-2.15,0,1.1),working:v(-2.3,0,.85),rotation:Math.PI/2,lookTarget:v(-3.65,1.3,1)}
  };
  // Rectangles in X/Z. Expand by each body's radius when planning paths.
  const obstacles=[{x:-.9,z:-.55,w:2.1,d:1.12},{x:-3.65,z:1,w:1.65,d:1.15},{x:1.12,z:2.98,w:1.68,d:.87},{x:4.35,z:.15,w:1.55,d:.82}];
  return {root,stations,obstacles,materials:m};
}
