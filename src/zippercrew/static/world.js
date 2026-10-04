// Café assets in a small shared world coordinate system. No runtime logic here.
// x/y lie on the floor; z is height. Every solid uses the same soft isometric projection.
export const project = (x, y, z = 0) => ({ x: 660 + (x - y) * .88, y: 280 + (x + y) * .44 - z });
const point = ([x, y, z = 0]) => { const p = project(x, y, z); return `${p.x},${p.y}`; };
export const plane = (points, fill, attrs = '') => `<polygon points="${points.map(point).join(' ')}" fill="${fill}" ${attrs}/>`;
export function box(x, y, z, w, d, h, top, front, side) {
  return plane([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]], top)
    + plane([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]], front)
    + plane([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]], side);
}
function line(a, b, color, width = 1, extra = '') {
  return `<path d="M${point(a)}L${point(b)}" stroke="${color}" stroke-width="${width}" ${extra}/>`;
}
export function shadow(x, y, rx, ry, opacity = .16) {
  const p = project(x,y);
  return `<ellipse cx="${p.x}" cy="${p.y+4}" rx="${rx}" ry="${ry}" fill="#384638" opacity="${opacity}" filter="url(#soft-shadow)"/>`;
}
function plant(x,y,size = 1) {
  const p = project(x,y);
  return shadow(x,y,27*size,12*size) + `<g transform="translate(${p.x} ${p.y}) scale(${size})">
    <path d="M-23-39h46l-5 37Q0 9-18-2Z" fill="#b96e51"/><ellipse cy="-39" rx="23" ry="10" fill="#d59a73"/><ellipse cy="-39" rx="18" ry="7" fill="#665342"/>
    <path d="M0-40v-92m0 62-28-27m28 15 30-30m-30 53 28-16" stroke="#476b51" stroke-width="3" fill="none"/>
    <path d="M0-109q-32-45-9-51 26 16 9 51M-2-83q-51-4-42-34 32-8 42 34M2-92q8-53 38-46 7 35-38 46M1-58q29-41 47-19-7 29-47 19M-3-61q-42-4-32-27 25-4 32 27" fill="#608568"/>
    <path d="M0-109q-9-26-9-42M1-94l30-31M-1-84l-33-23" stroke="#8fab7b" stroke-width="2" fill="none"/>
  </g>`;
}
function cup(x,y,z = 80) {
  const p=project(x,y,z);
  return `<g transform="translate(${p.x} ${p.y})"><ellipse cy="5" rx="12" ry="5" fill="#8c7254" opacity=".2"/><path d="M-8-11h16V1Q0 8-8 1Z" fill="#fff5db"/><path d="M8-8q12-1 8 7L8 0" fill="none" stroke="#fff5db" stroke-width="3"/><ellipse cy="-11" rx="8" ry="3" fill="#75533d"/></g>`;
}
export function desk(role) {
  const {x,y} = role.station, human = role.kind === 'human';
  const w=human?136:175, d=human?86:104;
  let art = shadow(x,y,100,27,.13);
  if (human) {
    const p=project(x,y,78);
    art+=box(x-9,y-9,0,18,18,72,'#788672','#65745f','#4e6050');
    const foot=project(x,y);
    art+=`<ellipse cx="${foot.x}" cy="${foot.y}" rx="38" ry="19" fill="#5e705e"/>
      <ellipse cx="${p.x}" cy="${p.y+9}" rx="98" ry="49" fill="#b78b59"/>
      <ellipse cx="${p.x}" cy="${p.y}" rx="98" ry="49" fill="#e6be85"/>
      <ellipse cx="${p.x}" cy="${p.y}" rx="87" ry="43" fill="none" stroke="#f0ce9d"/>`;
  } else {
    for (const [dx,dy] of [[-w/2+9,-d/2+9],[w/2-18,-d/2+9],[-w/2+9,d/2-18],[w/2-18,d/2-18]])
      art += box(x+dx,y+dy,0,9,9,70,'#738071','#627365','#4b5d51');
    art += box(x-w/2,y-d/2,69,w,d,9,'#e8bf85','#b78955','#cca16a');
    art += line([x-w/2+8,y+d/2,76],[x+w/2-8,y+d/2,76],'#f9d5a2',1.5);
  }
  // A role-colored desk mat, keyboard and upright screen share the floor projection.
  art += plane([[x-52,y-31,79],[x+42,y-31,79],[x+42,y+27,79],[x-52,y+27,79]],role.mat);
  art += plane([[x-34,y+2,80],[x+15,y+2,80],[x+15,y+21,80],[x-34,y+21,80]],'#d8ded2');
  for(let i=0;i<3;i++) art += line([x-28,y+6+i*4,81],[x+9,y+6+i*4,81],'#8e9c91',1.2);
  if(human) {
    art+=plane([[x-40,y-8,81],[x+31,y-8,81],[x+25,y-16,121],[x-45,y-16,121]],'#597564','stroke="#42614f" stroke-width="2"');
    art+=plane([[x-34,y-9,86],[x+24,y-9,86],[x+19,y-15,115],[x-38,y-15,115]],'#cee1c9','class="monitor-glass"');
    for(let i=0;i<3;i++)art+=line([x-30,y-14,108-i*6],[x+10,y-14,108-i*6],role.color,2);
  } else {
    art += box(x-12,y-21,80,8,8,10,'#475b54','#42574e','#354a43');
    art += plane([[x-49,y-26,91],[x+36,y-26,91],[x+36,y-26,149],[x-49,y-26,149]],'#354d46','stroke="#2d423c" stroke-width="3" stroke-linejoin="round"');
    art += plane([[x-43,y-26,97],[x+30,y-26,97],[x+30,y-26,143],[x-43,y-26,143]],'#bdd8c9','class="monitor-glass"');
    art += '<g class="code-lines">';
    for(let i=0;i<4;i++) art += line([x-35,y-26,133-i*8],[x+(i%2?17:2),y-26,133-i*8],i===1?role.color:'#568676',2.8,'stroke-linecap="round"');
    art += '</g>';
  }
  if(role.name==='Implementer') {
    art += box(x+51,y-35,80,22,24,35,'#606e60','#3f524b','#516658');
    art += line([x+73,y-32,105],[x+73,y-14,105],'#98bb9b',2);
  } else if (!human) {
    art += plane([[x+47,y-15,80],[x+76,y-15,80],[x+76,y+20,80],[x+47,y+20,80]],'#fff8dd');
    for(let i=0;i<4;i++) art+=line([x+52,y-8+i*6,81],[x+70,y-8+i*6,81],'#92a997');
  }
  return art + cup(x-w/2+18,y+20);
}
export function chair(role) {
  const {x,y}=role.seat, p=project(x,y);
  return shadow(x,y,30,12) + `<g transform="translate(${p.x} ${p.y})">
    <path d="M-20-27-26 3m44-30 9 30M0-27v29" stroke="#4b6054" stroke-width="5" stroke-linecap="round"/>
    <path d="M-26-35 0-47 28-33 5-20Z" fill="${role.color}"/><path d="M-26-35v8L5-13v-7Z" fill="${role.shade}"/>
    <path d="M-27-36v-77q0-12 12-7l37 17q6 3 6 12v58Z" fill="${role.shade}"/><path d="M-24-42v-68q0-8 8-4l34 16q6 3 6 10v54Z" fill="${role.color}"/>
  </g>`;
}
function coffeeCounter() {
  let s = shadow(110,62,105,33) + box(32,23,0,172,66,93,'#dfcdb1','#a6815c','#826747');
  for(let i=0;i<12;i++) s+=line([40+i*13,89,7],[40+i*13,89,89],'#bd9971',3);
  s+= box(23,15,93,190,83,8,'#f3e3c3','#d8c6a5','#bcac8e');
  s+=box(50,34,101,74,43,63,'#47615a','#456058','#304940');
  s+=plane([[57,77,137],[117,77,137],[117,77,154],[57,77,154]],'#a7b9a6');
  for(const x of [66,87,106]) {const p=project(x,78,146);s+=`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#eee4ba"/>`;}
  s+=line([78,77,135],[78,77,119],'#273d35',4)+cup(78,78,103)+cup(106,78,103);
  s+=box(144,40,101,31,31,35,'#d6b383','#c29b66','#a98457');
  s+=box(141,38,136,37,35,5,'#5e6755','#465644','#50604c');
  return s;
}
function board() {
  // Board lies on the rear right wall, so its typography and frame share its plane.
  const p=project(335,7,186);
  return `<g transform="matrix(.88 .44 0 1 ${p.x} ${p.y})">
    <rect x="3" y="4" width="246" height="146" rx="5" fill="#304f43" opacity=".17"/>
    <rect width="246" height="146" rx="5" fill="#aa835b"/><rect x="7" y="7" width="232" height="130" rx="2" fill="#f8f1d8"/>
    <path d="M23 33h198" stroke="#d4ceb5"/><text x="23" y="25" class="board-heading">Shared brief</text>
    <text id="board-task" x="23" y="59" class="board-task">What are we</text><text id="board-task-second" x="23" y="82" class="board-task">working on?</text>
    <path d="M23 102h155" stroke="#ddd4bc"/><text id="board-workspace" x="23" y="122" class="board-workspace">Choose a repository</text>
    <circle cx="217" cy="118" r="12" fill="#dde4c6"/><path d="M212 118h10m-5-5v10" stroke="#486c50" stroke-width="2"/>
  </g>`;
}
export const environmentEntities = [
  {id:'coffee-counter',kind:'furniture',x:110,y:75,render:coffeeCounter},
  {id:'plant-back',kind:'decor',x:31,y:196,render:()=>plant(31,196,.95)},
  {id:'plant-right',kind:'decor',x:612,y:42,render:()=>plant(612,42,.9)},
  {id:'plant-front',kind:'decor',x:51,y:546,render:()=>plant(51,546,1.05)},
  {id:'project-board',kind:'brief',x:445,y:7,select:'brief',label:'Edit workspace and task',render:board},
];
export function architecture() {
  let s=`<defs>
    <filter id="soft-shadow" x="-40%" y="-100%" width="180%" height="300%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="building-shadow" x="-20%" y="-20%" width="150%" height="150%"><feGaussianBlur stdDeviation="18"/></filter>
    <linearGradient id="daylight" x2="0" y2="1"><stop stop-color="#9cc4c5"/><stop offset="1" stop-color="#d5e5d0"/></linearGradient>
  </defs>`;
  s+=plane([[0,0,-25],[650,0,-25],[650,600,-25],[0,600,-25]],'#466256','filter="url(#building-shadow)" opacity=".3" transform="translate(10 20)"');
  s+=box(-7,-7,-26,664,614,26,'#dcbf92','#a78661','#b99870');
  s+=plane([[0,0],[650,0],[650,600],[0,600]],'#e1c59a');
  for(let y=0;y<=600;y+=40) {
    s+=line([0,y],[650,y],'#ccb184',1.4);
    for(let x=(y%80?90:10);x<650;x+=130) s+=line([x,y],[x,Math.min(y+40,600)],'#ccb184');
  }
  // Back and side walls, with visible thickness and baseboards.
  s+=box(-9,-9,0,9,617,240,'#ede3ca','#e7dec9','#c5c9b5');
  s+=box(-9,-9,0,667,9,240,'#e7e7d5','#b8c8b3','#9eaf9c');
  s+=box(0,0,0,650,5,11,'#91a98f','#91a98f','#91a98f');
  s+=box(0,0,0,5,600,11,'#c9c2a8','#c9c2a8','#c9c2a8');
  // Broad window on the left wall, daylight projected across the floor.
  s+=plane([[3,205,61],[3,518,61],[3,518,209],[3,205,209]],'#a4ada0','stroke="#f9f2de" stroke-width="13" stroke-linejoin="round"');
  s+=plane([[4,211,67],[4,512,67],[4,512,203],[4,211,203]],'url(#daylight)');
  const win=project(5,211,203);
  s+=`<g transform="matrix(-.88 .44 0 1 ${win.x} ${win.y})"><path d="M0 92h27V54h35v45h30V40h43v49h42V65h38v41h51V73h35v63H0Z" fill="#a6bfb0"/><path d="M0 121q40-33 65-7t65 3 82-12 89 18v13H0Z" fill="#8faa91"/></g>`;
  for(const y of [211,311,411,512]) s+=line([5,y,67],[5,y,203],'#faf4df',5);
  s+=line([6,211,130],[6,512,130],'#faf4df',5);
  s+=box(0,197,53,20,330,8,'#f5ecd4','#d2c6aa','#c4bda5');
  s+=plane([[20,210,1],[20,506,1],[295,584,1],[307,292,1]],'#fff4cf','opacity=".21"');
  // A large woven working area, projected onto the floor.
  s+=plane([[105,160,1],[581,160,1],[581,519,1],[105,519,1]],'#879a83','stroke="#a9b49a" stroke-width="4" stroke-linejoin="round"');
  s+=plane([[115,170,2],[571,170,2],[571,509,2],[115,509,2]],'none','stroke="#bac3a5" stroke-width="2"');
  for(let y=181;y<509;y+=11) s+=line([119,y,2],[567,y,2],'#9dab91',.8);
  // Wall shelf and café details remain subordinate to the crew.
  s+=box(37,3,180,174,22,7,'#bb966c','#9e7d56','#967650');
  for(let i=0;i<7;i++) s+=box(50+i*15,6,187,10,12,24+i%3*6,['#af7252','#d7c193','#5d7f6e'][i%3],'#a48866','#826e53');
  const sign=project(251,4,192);
  s+=`<g transform="matrix(.88 .44 0 1 ${sign.x} ${sign.y})"><rect width="47" height="56" rx="3" fill="#e8ddbc"/><path d="M10 21h25v12q-12 14-25 0Zm25 3q15 0 6 10h-6" fill="none" stroke="#8a9676" stroke-width="3"/><path d="M18 12v-5m10 5V7" stroke="#a1aa8b" stroke-width="2"/></g>`;
  return s;
}
