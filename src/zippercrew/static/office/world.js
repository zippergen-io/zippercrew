// All placement is in native art pixels, on a 16 px tile grid. A sprite's x/y
// is its top-left; collision boxes describe only its footprint on the floor.
// Trim only the empty exterior margin; world coordinates stay unchanged.
export const VIEW = {x:24,y:16,width:512,height:320};
export const WALK_SPEED = {human:76,agent:72};
export const TOP_WALL = {windows:[52,336],clock:{x:307,y:35,width:18,height:18}};
export const TASK_BOARD = {id:'task-board',type:'taskBoard',x:160,y:35,width:134,height:61,footprint:[8,56,117,4]};
// Quiet lounge-edge nooks. Ground anchors and a bounded route keep the small
// companion away from desks, message handoffs and the main circulation lane.
export const COMPANION = {
  size:'small', // 'original' restores the approved avatar-height artwork.
  spots:[{x:448,y:300},{x:412,y:292},{x:456,y:288}],
  bounds:{x:400,y:284,width:64,height:24},
  speed:17,firstWalk:28,quietDelay:2.5,restDurations:[43,37,51],
};
export const SOCIAL_SPOTS = [
  {id:'coffee',label:'At the coffee corner',points:[{x:428,y:108},{x:464,y:108}]},
  {id:'nook',label:'Taking a moment in the nook',points:[{x:408,y:190},{x:444,y:190}]},
];
export const WORLD = {
  width: 560, height: 352, tile: 16,
  floor: { x: 32, y: 64, width: 496, height: 256 },
  rooms: [{ id: 'studio', label: 'The studio', bounds: [32, 24, 496, 304] }],
  zones: [
    { id: 'work', label: 'THE WORKSHOP', x: 56, y: 111, width: 248, height: 181, style: 'sage', labelOffsetY:-7 },
    { id: 'lounge', label: 'THE NOOK', x: 352, y: 123, width: 144, height: 156, style: 'cream' },
  ],
  furniture: [
    TASK_BOARD,
    { id: 'mira-desk', type: 'desk', owner:'planner', x: 69, y: 125, variant: 0, footprint: [0, 10, 82, 29],
      lights:[{kind:'lamp',x:11,y:19,rx:62,ry:52,strength:.6},{kind:'screen',x:43,y:12,rx:33,ry:55,strength:.23}] },
    { id: 'theo-desk', type: 'desk', owner:'worker', x: 201, y: 125, variant: 1, footprint: [0, 10, 82, 29],
      lights:[{kind:'screen',x:40,y:12,rx:40,ry:58,strength:.28}] },
    { id: 'jules-desk', type: 'desk', owner:'reviewer', x: 69, y: 216, variant: 2, footprint: [0, 10, 82, 29],
      lights:[{kind:'screen',x:43,y:12,rx:33,ry:55,strength:.23}] },
    { id: 'your-desk', type: 'desk', owner:'human', x: 201, y: 216, variant: 3, footprint: [0, 10, 82, 29],
      lights:[{kind:'lamp',x:74,y:20,rx:62,ry:56,strength:.58},{kind:'screen',x:43,y:12,rx:33,ry:55,strength:.23}] },
    ...[[100,152],[232,152],[100,243],[232,243]].map(([x,y],i)=>({
      id:`chair-${i}`,type:'chair',x,y,variant:i,footprint:[2,5,18,12],
      // Seat is the hip contact point, NOT the chair's top-left or backrest.
      // Feet enter beside the cushion; the backrest is never an entry route.
      seat:{x:12,y:13,direction:'up',approaches:[{x:-12,y:21},{x:36,y:21}]},
    })),
    { id:'sofa',type:'sofa',x:388,y:130,footprint:[0,10,89,31] },
    { id:'coffee-table',type:'table',x:405,y:213,footprint:[1,1,47,24] },
    { id:'lounge-chair',type:'armchair',x:357,y:243,footprint:[0,3,27,27],seat:{x:14,y:18,direction:'down',approach:{x:14,y:39}} },
    { id:'side-table',type:'sideTable',x:481,y:150,footprint:[0,1,19,15] },
    { id:'library',type:'shelf',x:78,y:66,footprint:[0,17,74,15] },
    { id:'coffee-bar',type:'coffeeBar',x:434,y:65,footprint:[0,12,69,17] },
    { id:'record-cabinet',type:'cabinet',x:67,y:296,footprint:[0,5,75,17] },
    { id:'plant-entry',type:'plant',x:470,y:290,variant:0,footprint:[7,20,17,10] },
    { id:'plant-window',type:'plant',x:43,y:64,variant:1,footprint:[7,20,17,10] },
    { id:'plant-lounge',type:'plant',x:481,y:244,variant:0,footprint:[7,20,17,10] },
    { id:'plant-corner',type:'plant',x:320,y:66,variant:1,footprint:[7,20,17,10] },
    { id:'lamp',type:'lamp',x:364,y:126,footprint:[4,22,11,5],
      lights:[{kind:'lamp',x:11,y:27,rx:106,ry:96,strength:.76}] },
  ],
};
export const PEOPLE = [
  {id:'planner',name:'Mira',role:'Critical reviewer',kind:'AI agent',color:'#7898aa',x:112,y:194,home:{x:112,y:194},chairId:'chair-0',direction:'up',description:'Checks assumptions, edge cases, and evidence with read-only access.',status:'Ready'},
  {id:'worker',name:'Theo',role:'Worker',kind:'AI agent',color:'#708a62',x:244,y:194,home:{x:244,y:194},chairId:'chair-1',direction:'up',description:'Works on your task with write access to the repository.',status:'Ready'},
  {id:'reviewer',name:'Jules',role:'Reviewer',kind:'AI agent',color:'#d7836e',x:394,y:201,home:{x:112,y:285},chairId:'chair-2',direction:'left',description:'Reviews the work with read-only access to the repository.',status:'Ready'},
  {id:'human',name:'You',role:'Human',kind:'That’s you',color:'#d2a34f',x:320,y:281,home:{x:244,y:285},chairId:'chair-3',direction:'down',description:'Walk around. Say hello. Make yourself at home.',status:'Taking it all in'},
];
