// All placement is in native art pixels, on a 16 px tile grid. A sprite's x/y
// is its top-left; collision boxes describe only its footprint on the floor.
export const WORLD = {
  width: 560, height: 352, tile: 16,
  floor: { x: 32, y: 64, width: 496, height: 256 },
  rooms: [{ id: 'studio', label: 'The studio', bounds: [32, 24, 496, 304] }],
  zones: [
    { id: 'work', label: 'THE WORKSHOP', x: 56, y: 111, width: 248, height: 181, style: 'sage' },
    { id: 'lounge', label: 'THE NOOK', x: 352, y: 123, width: 144, height: 156, style: 'cream' },
  ],
  furniture: [
    { id: 'mira-desk', type: 'desk', owner:'planner', x: 69, y: 125, variant: 0, footprint: [0, 10, 82, 29],
      lights:[{kind:'lamp',x:11,y:19,rx:62,ry:52,strength:.6},{kind:'screen',x:43,y:12,rx:33,ry:55,strength:.23}] },
    { id: 'theo-desk', type: 'desk', owner:'worker', x: 201, y: 125, variant: 1, footprint: [0, 10, 82, 29],
      lights:[{kind:'screen',x:40,y:12,rx:40,ry:58,strength:.28}] },
    { id: 'jules-desk', type: 'desk', owner:'reviewer', x: 69, y: 216, variant: 2, footprint: [0, 10, 82, 29],
      lights:[{kind:'screen',x:43,y:12,rx:33,ry:55,strength:.23}] },
    { id: 'your-desk', type: 'desk', owner:'human', x: 201, y: 216, variant: 3, footprint: [0, 10, 82, 29],
      lights:[{kind:'lamp',x:74,y:20,rx:62,ry:56,strength:.58},{kind:'screen',x:43,y:12,rx:33,ry:55,strength:.23}] },
    ...[[100,167],[232,167],[100,258],[232,258]].map(([x,y],i)=>({
      id:`chair-${i}`,type:'chair',x,y,variant:i,footprint:[2,5,18,12],
      // Seat is the hip contact point, NOT the chair's top-left or backrest.
      seat:{x:12,y:13,direction:'up',approach:{x:12,y:27}},
    })),
    { id:'sofa',type:'sofa',x:388,y:130,footprint:[0,10,89,31] },
    { id:'coffee-table',type:'table',x:405,y:213,footprint:[1,1,47,24] },
    { id:'lounge-chair',type:'armchair',x:357,y:243,footprint:[0,3,27,27],seat:{x:14,y:18,direction:'down',approach:{x:14,y:39}} },
    { id:'side-table',type:'sideTable',x:481,y:150,footprint:[0,1,19,15] },
    { id:'library',type:'shelf',x:219,y:59,footprint:[0,17,74,15] },
    { id:'coffee-bar',type:'coffeeBar',x:434,y:65,footprint:[0,12,69,17] },
    { id:'record-cabinet',type:'cabinet',x:67,y:296,footprint:[0,5,75,17] },
    { id:'plant-entry',type:'plant',x:470,y:290,variant:0,footprint:[7,20,17,10] },
    { id:'plant-window',type:'plant',x:47,y:64,variant:1,footprint:[7,20,17,10] },
    { id:'plant-lounge',type:'plant',x:481,y:244,variant:0,footprint:[7,20,17,10] },
    { id:'plant-corner',type:'plant',x:320,y:66,variant:1,footprint:[7,20,17,10] },
    { id:'lamp',type:'lamp',x:364,y:126,footprint:[4,22,11,5],
      lights:[{kind:'lamp',x:11,y:27,rx:106,ry:96,strength:.76}] },
  ],
};
export const PEOPLE = [
  {id:'planner',name:'Mira',role:'Planner',kind:'AI agent',color:'#7898aa',x:368,y:201,home:{x:112,y:194},chairId:'chair-0',direction:'right',description:'Makes a little order out of big ideas.',status:'Comparing notes with Jules'},
  {id:'worker',name:'Theo',role:'Worker',kind:'AI agent',color:'#708a62',x:244,y:194,home:{x:244,y:194},chairId:'chair-1',direction:'up',description:'Turns the plan into something you can try.',status:'Working through the first draft'},
  {id:'reviewer',name:'Jules',role:'Reviewer',kind:'AI agent',color:'#d7836e',x:394,y:201,home:{x:112,y:285},chairId:'chair-2',direction:'left',description:'A fresh pair of eyes and a thoughtful second pass.',status:'Comparing notes with Mira'},
  {id:'human',name:'You',role:'Human',kind:'That’s you',color:'#d2a34f',x:320,y:281,home:{x:244,y:285},chairId:'chair-3',direction:'down',description:'Walk around. Say hello. Make yourself at home.',status:'Taking it all in'},
];
