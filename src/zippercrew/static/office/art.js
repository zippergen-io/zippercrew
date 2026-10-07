// Original, replaceable pixel artwork. These small canvases are texture sources,
// never DOM scenery. Phaser owns the tilemap, sprites, depth, input and animation.
import { WORLD } from './world.js';
import { CHARACTER_DESIGNS, drawCharacter as character, drawSeatedCharacter as seatedCharacter, drawBlinkCharacter as blinkCharacter } from './characters.js';
import { colorFor } from './palettes.js';

// Seating aligns this hip point with the chair's seat, independently of the
// sprite origin. All sprite depths and positions continue to use FEET.
export const CHARACTER_ANCHORS = { hip: {x:16,y:25}, feet: {x:16,y:33} };
export const SEATED_FRAMES = {up:16,down:20};

const C={edge:'#6a6254',wood:'#be9166',woodLight:'#d9b183',woodTop:'#ead0a3',woodDark:'#9e795a',cream:'#f1ead4',dark:'#47554e',sage:'#97a48c',sageLight:'#b6bea1',leaf:'#718d58',leafLight:'#9cad72',leafDark:'#506d46',pot:'#b67e60'};
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
function painter(canvas,mood='day',isCharacter=false){const c=canvas.getContext('2d');c.imageSmoothingEnabled=false;return {
  r:(x,y,w,h,color)=>{c.fillStyle=colorFor(mood,color,isCharacter);c.fillRect(Math.round(x),Math.round(y),w,h);},
  line(x0,y0,x1,y1,color){c.fillStyle=colorFor(mood,color,isCharacter);let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;for(;;){c.fillRect(x0,y0,1,1);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}},
  c,mood,
};}
function box(p,x,y,w,h,fill,edge=C.edge){p.r(x,y,w,h,edge);p.r(x+1,y+1,w-2,h-2,fill);}
function shadow(p,x,y,w,h){p.r(x+3,y+1,w-3,h,'#59463618');p.r(x+2,y+1,w-4,Math.max(2,h-2),'#473a3130');p.r(x+4,y,w-8,2,'#41383028');}
function leaf(p,x,y,w,h,color){p.r(x+2,y,w-4,h,color);p.r(x,y+2,w,h-4,color);}
function plant(p,x,y,small=false,variant=0){
  if(small){box(p,x+3,y+9,8,6,C.pot);p.r(x+4,y+9,6,2,'#d5a07b');p.r(x+6,y+3,2,7,C.leafDark);leaf(p,x,y+3,7,5,C.leaf);leaf(p,x+7,y,6,7,C.leafLight);p.r(x+3,y+3,2,2,'#b1bd81');return;}
  shadow(p,x+4,y+27,24,5);
  if(variant===1){
    // Upright leaves and a square ceramic planter contrast with the broad ficus.
    box(p,x+7,y+21,18,10,'#a3a991');p.r(x+9,y+23,14,2,'#665e50');
    p.r(x+8,y+22,16,2,'#d6d7bf');p.r(x+9,y+26,2,4,'#c9c6ad');p.r(x+22,y+24,2,6,'#737b6b');
    for(const [base,tip,top] of [[9,5,6],[19,24,4],[12,9,0],[16,15,-2],[20,21,8]]){
      const height=25-top;
      for(let row=0;row<height;row++){
        const t=row/height,width=1+Math.floor(Math.sin(t*Math.PI*.88)*4);
        const px=x+Math.round(tip+(base-tip)*t)-Math.floor(width/2);
        p.r(px,y+top+row,width,1,C.leafDark);
        if(width>1)p.r(px+1,y+top+row,width-1,1,C.leaf);
        if(width>2)p.r(px+width-1,y+top+row,1,1,C.leafLight);
      }
    }
    return;
  }
  p.r(x+8,y+20,16,9,C.edge);p.r(x+10,y+29,12,2,C.edge);p.r(x+9,y+21,14,7,C.pot);p.r(x+10,y+21,12,2,'#d5a98a');p.r(x+18,y+24,4,5,'#a16e55');p.r(x+11,y+24,2,4,'#d5a98a');p.r(x+10,y+20,12,1,'#665e50');p.r(x+14,y+8,3,15,C.leafDark);
  leaf(p,x+2,y+6,13,9,C.leafDark);leaf(p,x+1,y+4,12,8,C.leaf);p.line(x+5,y+7,x+14,y+15,C.leafLight);leaf(p,x+16,y+2,13,10,C.leafDark);leaf(p,x+17,y,11,9,C.leaf);p.line(x+24,y+3,x+16,y+15,C.leafLight);leaf(p,x+8,y-1,10,12,C.leafDark);leaf(p,x+9,y-2,8,10,C.leafLight);p.r(x+12,y+1,2,9,C.leaf);leaf(p,x+19,y+13,12,7,C.leaf);p.line(x+27,y+15,x+17,y+21,C.leafLight);leaf(p,x+2,y+14,13,6,C.leafLight);p.line(x+6,y+16,x+15,y+20,C.leaf);
  p.r(x+3,y+8,2,1,C.leafLight);p.r(x+20,y+2,3,1,C.leafLight);p.r(x+10,y+14,2,3,C.leafDark);
}
function mug(p,x,y,color='#b77156'){box(p,x,y,5,6,color);p.r(x+1,y+1,3,1,'#f3e3c4');p.r(x+5,y+1,2,3,C.edge);p.r(x+5,y+2,1,1,C.cream);}
function book(p,x,y,w,h,color){box(p,x,y,w,h,color);p.r(x+1,y+1,1,h-2,'#ffffff40');p.r(x+2,y+h-3,w-3,1,'#dfdbc3');}
function deskLamp(p,x,y,style){
  if(style==='task'){
    box(p,x+3,y+24,13,3,'#a2aa8e');p.r(x+6,y+24,8,1,'#d6d7bf');
    p.line(x+9,y+23,x+7,y+13,C.edge);p.line(x+10,y+23,x+8,y+13,'#929c8c');
    p.line(x+7,y+13,x+14,y+5,C.edge);p.line(x+8,y+13,x+15,y+5,'#b4bdab');
    box(p,x+7,y+11,3,3,'#e3dfcb');p.r(x+12,y+1,6,1,C.edge);p.r(x+10,y+2,10,5,C.edge);
    p.r(x+11,y+2,8,3,'#839687');p.r(x+12,y+2,6,1,'#adbaa1');p.r(x+11,y+6,8,1,'lampShade');
  }else{
    box(p,x+2,y+22,14,3,'#bba276');p.r(x+4,y+22,10,1,'#f0dfb5');
    p.r(x+8,y+6,2,16,C.edge);p.r(x+8,y+7,1,14,'#d9b183');
    p.r(x+5,y,8,2,C.edge);p.r(x+3,y+2,12,2,C.edge);p.r(x+1,y+4,16,5,C.edge);
    p.r(x+6,y+1,6,1,'#d3c390');p.r(x+4,y+2,10,2,'#d3c390');p.r(x+2,y+4,14,4,'lampShade');p.r(x+3,y+8,12,1,'lampEdge');
  }
}
function desk(p,variant){
  shadow(p,1,37,82,7);box(p,3,24,5,17,C.woodDark);box(p,75,24,5,17,C.woodDark);p.r(4,26,2,12,C.woodLight);p.r(76,26,2,12,C.woodLight);box(p,0,10,82,22,C.wood);p.r(1,11,80,17,C.woodTop);p.r(2,11,78,1,'#f5e4bc');p.r(2,29,78,2,C.woodDark);p.r(9,21,19,1,'#dbc297');p.r(58,14,19,1,'#e0c393');
  p.r(2,31,77,1,'#665e50');p.r(4,33,3,5,'#665e50');p.r(77,33,2,5,'#665e50');
  p.r(8,12,21,1,'#f5e4bc');p.r(60,26,13,1,'#dbc297');
  if(variant!==1){box(p,12,29,21,8,C.woodLight);p.r(20,32,5,1,C.woodDark);p.r(14,30,17,1,'#ead0a3');}
  else{box(p,11,29,18,13,'#47554e');p.r(13,31,13,1,'#737b6b');p.r(13,34,13,1,'#737b6b');p.r(24,38,2,1,'#b4bdab');}
  if(variant===2){p.r(61,32,2,7,C.woodDark);p.r(61,39,10,1,C.woodDark);p.r(69,32,2,7,C.woodDark);}
  // Felt desk pad, screen, stand, compact keyboard and mouse.
  box(p,26,16,34,11,'#a8b09c','#9ba68f');box(p,39,11,7,8,'#737b6b');p.r(35,19,15,2,C.edge);box(p,27,0,32,19,C.dark);p.r(29,2,28,14,'#9cbdba');p.r(30,3,26,1,'#c5d6c8');p.r(29,15,28,1,'#729790');p.r(41,17,3,1,'#b4bdab');
  if(variant===0){p.r(32,6,9,7,'#ecdfbb');p.r(44,5,9,2,'#cfdbc3');p.r(44,9,7,1,'#61877e');p.r(44,12,9,1,'#61877e');p.r(33,7,5,1,'#c3a875');}
  else if(variant===1){p.r(32,5,23,9,'#587b75');for(let y=0;y<3;y++){p.r(34,y*3+6,3,1,'#d1c785');p.r(39,y*3+6,11-y*2,1,'#aec2a5');}}
  else if(variant===2){p.r(35,4,15,10,'#e5e3c9');p.r(37,6,9,1,'#9baf9c');p.r(38,9,1,3,'#6a956f');p.r(37,10,3,1,'#6a956f');p.r(42,10,5,1,'#9baf9c');}
  else{p.r(34,5,17,8,'#c6ceae');p.r(36,6,5,5,'#e3d49d');p.r(43,8,6,1,'#769888');}
  // Bezel corners, a single camera pixel, title bar and screen reflection.
  p.r(28,1,29,1,'#737b6b');p.r(42,1,1,1,'#c5d6c8');p.r(30,4,3,1,'#e2ede0');
  p.r(27,18,31,1,'#394f48');p.r(37,20,12,1,'#b4bdab');
  if(variant===3){box(p,26,20,35,9,'#a6ae9b','#737b6b');p.r(28,21,31,1,'#e3dfcb');}
  box(p,30,23,24,5,'#d6d7bf','#929c8c');for(let x=32;x<52;x+=3)p.r(x,24,1,2,'#a6ae9b');p.r(34,26,14,1,'#a6ae9b');box(p,59,22,4,6,'#e3dfcb','#9eaa97');
  mug(p,variant===3?66:67,22,['#bc8360','#789a8c','#bd965f','#7e92a3'][variant]);
  if(variant===0){book(p,16,17,8,9,'#819c85');p.r(19,18,1,7,'#dfdbc3');deskLamp(p,0,0,'task');p.r(65,13,7,5,'#f2dfab');p.r(73,14,5,4,'#d69c7e');p.r(66,15,4,1,'#b09c7b');}
  if(variant===1){
    // A compact portrait display and a tower distinguish the worker station.
    box(p,7,1,15,19,'#47554e');p.r(9,3,11,14,'#587b75');p.r(10,4,9,1,'#c5d6c8');
    for(let y=7;y<15;y+=3){p.r(10,y,2,1,'#d1c785');p.r(14,y,4,1,'#aec2a5');}
    p.r(13,20,3,3,'#737b6b');p.r(9,23,12,1,C.edge);plant(p,65,-1,true);
    p.r(3,19,3,1,'#e3dfcb');p.r(2,20,5,7,'#7e92a3');p.r(3,20,1,5,'#c5d6c8');
  }
  if(variant===2){book(p,6,19,12,7,'#b38b75');book(p,8,15,12,6,'#efead4');p.r(10,17,7,1,'#b7b19c');p.r(19,16,2,2,'#d69c7e');p.r(22,17,1,8,'#637b6f');p.r(7,10,11,4,'#ece1bd');p.r(8,11,8,1,'#b7ac8d');p.r(19,5,5,5,'#d69c7e');}
  if(variant===3){box(p,8,14,12,9,'#bf8c6a');p.r(10,16,8,5,'#efdfb6');p.r(11,19,3,2,'#7f9b75');p.r(15,17,2,4,'#bd9a6c');}
  if(variant===3){deskLamp(p,64,0,'dome');p.r(9,25,12,1,'#b09c7b');p.r(10,24,4,1,'#e3dfcb');}
  // One-pixel cut corners, joinery and a modest cord below the back edge.
  if(variant===0||variant===3){p.c.clearRect(0,10,1,1);p.c.clearRect(81,10,1,1);}
  p.r(34,32,1,3,'#665e50');p.r(34,35,6,1,'#665e50');p.r(40,32,1,4,'#665e50');
}
function chair(p,variant,front=false){
  const color=variant===3?'#a7a98b':'#839687';
  if(front){
    // Armrests and seat lip overlap the seated thighs, never the whole torso.
    p.r(1,10,3,10,C.edge);p.r(20,10,3,10,C.edge);
    p.r(2,10,2,2,'#adbaa1');p.r(20,10,2,2,'#adbaa1');
    // Lip is two pixels higher: it meets the bent knees and leaves shoes clear.
    p.r(5,17,14,2,'#6d8272');p.r(6,17,12,1,color);return;
  }
  shadow(p,0,22,23,4);p.r(10,16,3,8,C.edge);p.r(3,23,18,1,C.edge);
  p.r(2,22,3,4,C.edge);p.r(18,22,3,4,C.edge);
  const top=variant===1?1:variant===2?4:3;
  box(p,3,top,18,15-top,color);p.r(5,top+1,14,1,'#adbaa1');
  if(variant===1){p.r(7,0,10,2,C.edge);p.r(8,1,8,2,color);p.r(6,6,12,1,'#6d8272');}
  if(variant===2){p.c.clearRect(3,4,1,1);p.c.clearRect(20,4,1,1);p.r(11,7,1,4,'#6d8272');}
  if(variant===3){p.r(7,6,1,1,'#6d8272');p.r(16,6,1,1,'#6d8272');}
  box(p,4,11,16,8,color);p.r(6,12,12,1,'#b6c1ab');p.r(6,15,12,1,'#adbaa1');
  p.r(10,21,3,4,C.edge);p.r(10,25,3,1,'#737b6b');
}
function sofa(p){
  shadow(p,0,38,91,6);box(p,5,32,5,10,C.woodDark);box(p,80,32,5,10,C.woodDark);
  box(p,2,0,86,33,'#bc8066');p.r(4,2,82,13,'#d69c7e');p.r(5,2,80,1,'#e6b799');
  box(p,3,14,84,21,'#c78b70');
  for(let x=9;x<84;x+=25){box(p,x,16,23,15,'#deaa8b','#bf856b');p.r(x+2,17,19,1,'#edbea0');p.r(x+10,22,2,1,'#ce9679');p.r(x+2,29,19,1,'#ce9679');p.r(x+21,19,1,9,'#ce9679');}
  box(p,0,10,8,27,'#d39778');box(p,82,10,8,27,'#d39778');p.r(1,11,6,2,'#e7b28e');p.r(83,11,6,2,'#e7b28e');p.r(8,34,74,3,'#ad755e');
  p.r(8,33,74,1,'#895646');p.r(6,39,2,2,'#d9b183');p.r(81,39,2,2,'#d9b183');
  box(p,13,7,14,13,'#e9d2a7','#b99071');p.r(15,9,10,1,'#f7e6c5');p.r(17,12,6,1,'#cbb88f');
  box(p,62,8,15,12,'#9baa8d','#7e8e73');p.r(64,9,11,2,'#c0c7a6');p.r(64,16,11,1,'#7e8e73');
  // A folded linen throw, kept within the existing sofa silhouette.
  p.r(9,25,16,5,'#b99071');p.r(9,25,15,3,'#e9d2a7');p.r(10,26,12,1,'#f7e6c5');
  for(let x=10;x<24;x+=3)p.r(x,29,1,2,'#e9d2a7');
}
function table(p){shadow(p,1,28,48,7);box(p,7,18,4,14,C.woodDark);box(p,38,18,4,14,C.woodDark);p.r(5,0,38,27,C.edge);p.r(1,4,46,19,C.edge);p.r(3,2,42,23,C.edge);p.r(5,1,38,21,C.woodTop);p.r(2,5,44,15,C.woodTop);p.r(4,3,40,19,C.woodTop);p.r(5,24,38,3,C.woodDark);p.r(2,21,44,3,C.wood);p.r(7,3,34,1,'#f7e3bb');book(p,9,9,12,9,'#829984');book(p,14,6,11,8,'#eee4c8');p.r(16,8,6,1,'#a7ab91');mug(p,31,12,'#b88165');}
function armchair(p,front=false){
  if(front){box(p,0,9,6,20,'#c2b27d');box(p,23,9,6,20,'#c2b27d');p.r(6,26,17,3,'#a99b6c');return;}
  shadow(p,0,29,29,5);p.r(3,28,4,5,C.woodDark);p.r(22,28,4,5,C.woodDark);box(p,1,0,26,22,'#b9a772');p.r(3,2,22,10,'#d3c390');box(p,3,12,22,15,'#dacb9a');p.r(7,13,15,1,'#efe0b1');
}
function shelf(p){
  shadow(p,1,29,76,6);box(p,0,0,74,33,C.woodDark);p.r(2,2,70,29,'#93755a');
  p.r(3,4,68,10,'#b99b75');p.r(3,18,68,11,'#b99b75');p.r(3,3,68,2,'#665e5050');p.r(3,17,68,2,'#665e5050');
  const colors=['#7e9885','#bba275','#bf8569','#a9b8a0','#7f909c'];
  let x=5;for(let i=0;i<6;i++){const w=i%2?3:4,h=8+i%3;book(p,x,14-h,w,h,colors[i%5]);p.r(x+1,11,w-2,1,'#dfdbc3');x+=w+1;}
  p.line(34,5,38,13,'#bf8569');p.line(35,5,39,13,C.edge);
  plant(p,40,-1,true);box(p,57,5,10,9,'#b57860');p.r(59,7,6,5,'#ece1bd');p.r(59,10,3,2,'#7e9885');p.r(63,8,2,4,'#bba275');
  box(p,6,21,16,8,'#b8bba1');p.r(7,21,14,1,'#dfdbc3');p.r(11,24,5,2,'#898c74');
  book(p,26,26,13,3,'#b57860');book(p,25,23,15,3,'#ece1bd');book(p,27,20,12,3,'#7f909c');
  for(let i=0;i<4;i++){book(p,45+i*4,19+i%2,3,10-i%2,colors[(i+2)%5]);p.r(46+i*4,23,1,2,'#dfdbc3');}
  p.r(63,21,5,8,'#ece1bd');p.r(65,21,1,8,'#b7ac8d');p.r(63,23,5,1,'#b57860');
  p.r(1,14,72,3,C.woodLight);p.r(2,14,70,1,'#ead0a3');p.r(1,1,72,2,'#ddbd91');p.r(1,30,72,3,C.wood);p.r(2,30,70,1,'#d9b183');
}
function coffeeBar(p){shadow(p,0,28,72,6);box(p,1,12,67,18,'#a2aa8e');p.r(3,14,63,14,'#bcc2a7');p.r(24,14,1,14,'#8f987f');p.r(45,14,1,14,'#8f987f');p.r(18,17,3,1,C.edge);p.r(39,17,3,1,C.edge);p.r(60,17,3,1,C.edge);box(p,0,9,69,5,C.woodTop);box(p,8,0,19,11,'#646e61');p.r(10,2,15,2,'#919c87');p.r(12,5,11,5,'#394f48');p.r(16,5,3,2,'#c7c4a9');p.r(15,8,5,3,'#f3e8ce');mug(p,33,5,'#eee3c8');mug(p,43,5,'#c6a678');plant(p,53,-2,true);}
function cabinet(p){
  shadow(p,0,21,78,5);box(p,0,9,75,14,C.wood);p.r(2,11,71,10,C.woodLight);
  p.r(24,11,1,10,C.woodDark);p.r(49,11,1,10,C.woodDark);p.r(25,16,24,1,C.woodDark);
  for(const [x,y]of [[18,14],[34,13],[34,18],[66,14]]){p.r(x,y,4,1,C.edge);p.r(x,y-1,4,1,'#ead0a3');}
  p.r(1,9,73,2,C.woodTop);p.r(2,22,71,1,'#665e50');
  book(p,8,6,15,3,'#7d9786');book(p,10,3,15,3,'#ece0b9');
  box(p,48,0,21,9,'#727b68');p.r(50,2,17,5,'#a3a991');
  for(let y=2;y<7;y+=2)for(let x=51;x<58;x+=2)p.r(x,y,1,1,'#59665b');
  p.r(61,2,5,1,'#e0c694');box(p,62,4,3,3,'#e3dfcb');
}
function sideTable(p){shadow(p,0,16,20,4);box(p,2,9,3,9,C.woodDark);box(p,14,9,3,9,C.woodDark);box(p,0,4,20,11,C.woodTop);plant(p,3,-7,true);}
function lamp(p){shadow(p,2,27,17,4);p.r(5,24,11,3,C.edge);p.r(7,23,7,3,'#bba276');p.r(10,7,2,17,C.woodDark);p.r(10,12,1,12,'#d9b183');p.r(6,0,10,2,C.edge);p.r(4,2,14,6,C.edge);p.r(2,8,18,4,C.edge);p.r(7,1,8,2,'lampShade');p.r(5,3,12,5,'lampShade');p.r(3,8,16,3,'lampShade');p.r(5,11,12,1,'lampEdge');p.r(7,4,1,5,'#bfa06c55');p.r(13,4,1,5,'#bfa06c55');p.r(6,9,10,1,'#f7e6c570');p.r(8,23,5,1,'#eddbad');}

function architecture(p){
  const {r}=p;
  // Stepped, solid shadows keep the entire scene on the same pixel grid.
  r(38,32,496,302,'#50604412');r(42,38,496,299,'#50604410');
  r(28,23,504,305,C.edge);r(30,25,500,300,'#a3ad94');r(32,27,496,38,'#dce1c5');r(32,28,496,3,'#edf0d9');r(32,54,496,9,'#a9b399');r(32,53,496,1,'#c9d2b5');r(32,62,496,4,'#82937b');
  // Fine plaster texture; deliberately subdued compared with the furniture.
  for(let x=39;x<525;x+=25){r(x,40+(x%11),2,1,'#cbd3b7');}
  const window=(x)=>{box(p,x,30,86,31,'#a1c0b8');r(x+3,33,80,23,'#c4d9ce');r(x+3,46,80,10,'#a1bba0');leaf(p,x+3,42,20,14,'#90ac91');leaf(p,x+17,47,23,9,'#829f80');leaf(p,x+54,39,23,17,'#a8bd9c');leaf(p,x+63,45,20,11,'#819f84');r(x+8,34,2,10,'#e2ede0');r(x+12,34,1,7,'#e2ede0');r(x+41,31,3,27,'#e5e5cd');r(x+2,45,82,2,'#e6e7d2');r(x+1,57,84,4,'#efe5c8');r(x-2,61,90,3,'#b9b298');r(x,60,86,2,'#f7edd6');};
  window(85);window(342);
  if(p.mood==='night')for(const x of [85,342]){r(x+22,37,1,1,'#c6d3e1');r(x+65,35,1,1,'#c6d3e1');}
  // The live task board occupies the central wall. Keep a small clock by coffee.
  r(458,35,12,18,C.edge);r(455,38,18,12,C.edge);r(458,36,12,16,'#f0e8d0');r(456,39,16,10,'#f0e8d0');r(463,38,2,1,'#b6af93');r(463,50,2,1,'#b6af93');
  // Side walls and low cutaway front wall. The entrance stays open.
  r(29,65,7,257,'#b7bea4');r(30,65,2,255,'#d6dcc0');r(36,65,2,255,'#bdac8d');r(524,65,7,257,'#a3b093');r(524,65,2,255,'#c4cdae');
  for(const [x,w] of [[29,232],[314,217]]){r(x,319,w,9,C.edge);r(x+1,319,w-2,5,'#b7c1a6');r(x+1,319,w-2,2,'#e0e2c8');r(x+1,324,w-2,3,'#95a58a');}
  r(261,318,53,5,'#c9b38c');r(261,323,53,2,'#dfcba4');r(263,325,49,2,'#ead7b1');
}

function rug(p,zone){
  const {width:w,height:h}=zone,work=zone.id==='work';
  // Same material colors; a narrow wood reveal and much quieter woven texture.
  p.r(4,5,w-7,h-7,'#473a3118');
  box(p,3,3,w-6,h-6,work?'#adb9a1':'#e1d6b6',work?'#99aa91':'#c1b99c');
  p.r(4,4,w-8,1,work?'#c5cdb580':'#f1e7ca90');
  p.r(4,h-5,w-8,1,work?'#9fab9480':'#c1b99480');
  if(work){
    for(let y=11;y<h-6;y+=12)for(let x=11;x<w-6;x+=12){p.r(x,y,1,1,'#9fab9460');p.r(x+1,y,1,1,'#c4ccb145');}
    for(let y=6;y<h-5;y+=5){p.r(2,y,1,2,'#c5cdb590');p.r(w-3,y,1,2,'#c5cdb590');}
  }else{
    for(let y=17;y<h-10;y+=24)for(let x=17;x<w-10;x+=24){
      p.line(x,y-3,x+3,y,'#c8c5a575');p.line(x+3,y,x,y+3,'#c8c5a575');
      p.line(x,y+3,x-3,y,'#c8c5a575');p.line(x-3,y,x,y-3,'#c8c5a575');
    }
    p.r(8,7,w-16,1,'#f0e4c590');p.r(8,h-8,w-16,1,'#f0e4c590');
    for(let x=9;x<w-7;x+=5){p.r(x,2,2,1,'#f1e7ca90');p.r(x,h-3,2,1,'#f1e7ca90');}
  }
}

// A deliberately small 3×5 bitmap alphabet. No browser-font smoothing in-world.
const GLYPHS={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001010100111','3':'110001010001110','4':'101101111001001','5':'111100110001110','6':'011100111101111','7':'111001010010010','8':'111101111101111','9':'111101111001110','.':'000000000000010',',':'000000000010100','!':'010010010000010','?':'110001010000010',"'":'010010000000000','-':'000000111000000',':':'000010000010000','+':'000010111010000','/':'001001010100100','&':'010101010101011'};
export function pixelText(p,text,x,y,color){[...text.toUpperCase()].forEach((ch,i)=>{const bits=GLYPHS[ch];if(bits)for(let j=0;j<15;j++)if(bits[j]==='1')p.r(x+i*4+j%3,y+Math.floor(j/3),1,1,color);});}
// Wrap at word boundaries on the native bitmap grid; never rasterize DOM fonts.
export function bubbleLines(text,width=38,maxLines=3){
  const clean=String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/…/g,'...').replace(/[–—·]/g,'-').replace(/[^\x20-\x7e\n]/g,' ');
  const lines=[];
  for(const paragraph of clean.split('\n')){
    const paragraphStart=lines.length;
    let line='';
    for(let word of paragraph.trim().split(/\s+/).filter(Boolean)){
      if(line&&line.length+word.length+1>width){lines.push(line);line='';}
      while(word.length>width){if(line){lines.push(line);line='';}lines.push(word.slice(0,width));word=word.slice(width);}
      line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);
    // Avoid a lone final word on its own line while preserving authored breaks.
    if(lines.length-paragraphStart>1){
      const last=lines.length-1;
      while(lines[last].length<width*.4){
        const words=lines[last-1].split(' ');if(words.length<3)break;
        const word=words.pop();if(word.length+1+lines[last].length>width)break;
        lines[last]=word+' '+lines[last];lines[last-1]=words.join(' ');
      }
    }
  }
  if(lines.length>maxLines)lines[maxLines-1]=lines[maxLines-1].slice(0,width-3).replace(/\s+\S*$/,'')+'...';
  return lines.slice(0,maxLines);
}
export function labelTexture(scene,text,{background=null,color='ink',bubble=false,accent=null,thought=false,roomStatus=false}={}){
  const lines=bubble?bubbleLines(text,roomStatus?44:38,roomStatus?6:3):[text];
  const key=`${scene.mood}:label:${lines.join('\n')}:${background}:${color}:${bubble}:${accent}:${thought}`;
  if(scene.textures.exists(key))return key;
  const w=Math.max(...lines.map(line=>line.length),1)*4+7+(accent?5:0);
  const body=bubble?lines.length*8+5:11,h=body+(bubble?4:0),c=make(w,h),p=painter(c,scene.mood);
  if(background){p.r(2,0,w-4,body,C.edge);p.r(0,2,w,body-4,C.edge);p.r(2,1,w-4,body-2,background);p.r(1,2,w-2,body-4,background);}
  const mid=Math.floor(w/2);
  if(thought){p.r(mid-2,body-1,3,2,C.edge);p.r(mid-1,body-1,1,1,background);p.r(mid+1,body+2,2,2,C.edge);}
  else if(bubble){p.r(mid-3,body-1,6,2,C.edge);p.r(mid-2,body+1,4,2,C.edge);p.r(mid-1,body+3,2,1,C.edge);p.r(mid-2,body-2,4,2,background);p.r(mid-1,body,2,2,background);}
  if(accent)p.r(3,4,3,3,accent);
  lines.forEach((line,i)=>pixelText(p,line,accent?9:4,3+i*8,color));
  scene.textures.addCanvas(key,c);return key;
}

export function createArt(scene,mood){
  const add=(name,w,h,fn)=>{
    const c=make(w,h);fn(painter(c,mood));scene.textures.addCanvas(`${mood}:${name}`,c);
    // These two surfaces have independent daylight tuning. Retain their neutral
    // material drawing for lamp light; unchanged assets reuse their day texture.
    if(mood==='day'&&(name==='architecture'||name==='rug-work')){
      const material=make(w,h);fn(painter(material,'material'));
      scene.textures.addCanvas(`material:${name}`,material);
    }
  };
  add('architecture',560,352,architecture);
  add('floor-tiles',64,16,p=>{for(let i=0;i<4;i++){let x=i*16;p.r(x,0,16,16,'#e3cfac');p.r(x,0,16,1,'#cdb994');p.r(x,1,16,1,'#efdcbb');if(i===0)p.r(x,1,1,15,'#cdb994');p.r(x+2+i,7,6,1,'#dcc6a0');p.r(x+7,12,5,1,'#ead6b2');}});
  for(const z of WORLD.zones)add(`rug-${z.id}`,z.width,z.height,p=>rug(p,z));
  for(let i=0;i<4;i++){add(`desk-${i}`,84,46,p=>desk(p,i));add(`chair-${i}-back`,24,28,p=>chair(p,i));add(`chair-${i}-front`,24,28,p=>chair(p,i,true));}
  for(const [type,w,h,draw]of[['sofa',92,46,sofa],['table',50,37,table],['armchair',30,36,armchair],['shelf',77,36,shelf],['coffeeBar',72,36,coffeeBar],['cabinet',79,26,cabinet],['sideTable',22,21,sideTable],['lamp',22,33,lamp]])add(type,w,h,draw);
  for(let i=0;i<2;i++)add(`plant-${i}`,34,36,p=>plant(p,0,3,false,i));
  add('armchair-front',30,36,p=>armchair(p,true));
  // Lighting owns this transparent native-resolution material layer at runtime.
  add('lighting',WORLD.width,WORLD.height,()=>{});
  add('selection',26,10,p=>{for(const [x,y,w,h]of[[4,0,18,1],[1,2,4,1],[21,2,4,1],[0,4,3,2],[23,4,3,2],[2,7,4,1],[20,7,4,1],[6,9,14,1]])p.r(x,y,w,h,'#faf1ca');});
  add('destination',13,9,p=>{for(const [x,y,w,h]of[[0,2,3,1],[0,2,1,3],[10,2,3,1],[12,2,1,3],[0,6,3,1],[10,6,3,1],[6,4,1,1]])p.r(x,y,w,h,'#f9f0ce');});
  for(const id of Object.keys(CHARACTER_DESIGNS)){
    const person={id};
    const c=make(128,252),p=painter(c,mood,true);['down','left','right','up','sit-up','sit-down','blink'].forEach((dir,row)=>{for(let frame=0;frame<4;frame++){p.c.save();p.c.translate(frame*32,row*36);if(dir==='blink')blinkCharacter(p,person,['down','left','right','up'][frame]);else if(dir.startsWith('sit-'))seatedCharacter(p,person,dir.slice(4),frame);else character(p,person,dir,frame);p.c.restore();}});
    scene.textures.addSpriteSheet(`${mood}:person-${person.id}`,c,{frameWidth:32,frameHeight:36});
  }
}
