import { WORLD } from './world.js';

// Small A* navigation grid, independent of the renderer and activity script.
// Footprints are expanded by the avatar radius, including diagonal clearance.
export function createNavigation(world=WORLD){
  const cell=4, radius=5, cols=world.width/cell, rows=world.height/cell;
  const obstacles=world.furniture.filter(f=>f.footprint).map(f=>{
    const [dx,dy,w,h]=f.footprint;return {id:f.id,x:f.x+dx-radius,y:f.y+dy-radius,w:w+radius*2,h:h+radius*2};
  });
  const {floor}=world;
  // A seated person is allowed inside only their own chair's clearance box.
  const free=(x,y,ownChair=null)=>x>=floor.x+11&&x<=floor.x+floor.width-11&&y>=floor.y+10&&y<=floor.y+floor.height-8&&!obstacles.some(o=>o.id!==ownChair&&x>=o.x&&x<=o.x+o.w&&y>=o.y&&y<=o.y+o.h);
  const at=(x,y)=>({x:Math.round(x/cell),y:Math.round(y/cell)});
  const key=(x,y)=>y*cols+x;
  const nearest=(x,y,clear=free)=>{const start=at(x,y);for(let ring=0;ring<20;ring++)for(let dy=-ring;dy<=ring;dy++)for(let dx=-ring;dx<=ring;dx++)if(Math.abs(dx)===ring||Math.abs(dy)===ring){const nx=start.x+dx,ny=start.y+dy;if(clear(nx*cell,ny*cell))return{x:nx,y:ny};}return null;};
  function route(from,to,avoid=[]){
    const clear=(x,y)=>free(x,y)&&!avoid.some(p=>Math.hypot(x-p.x,y-p.y)<13);
    const s=nearest(from.x,from.y),t=nearest(to.x,to.y,clear);if(!s||!t)return [];
    const goal=key(t.x,t.y),start=key(s.x,s.y),open=new Set([start]),closed=new Set(),cost=new Map([[start,0]]),parent=new Map();
    const heuristic=(k)=>Math.hypot(k%cols-t.x,Math.floor(k/cols)-t.y);
    let steps=0;
    while(open.size&&steps++<cols*rows){
      let current=-1,best=Infinity;for(const k of open){const f=cost.get(k)+heuristic(k);if(f<best){best=f;current=k;}}
      if(current===goal){const result=[];let k=goal;while(k!==start){result.push({x:(k%cols)*cell,y:Math.floor(k/cols)*cell});k=parent.get(k);}result.push({x:s.x*cell,y:s.y*cell});return result.reverse();}
      open.delete(current);closed.add(current);const x=current%cols,y=Math.floor(current/cols);
      for(const [dx,dy]of [[0,-1],[1,0],[0,1],[-1,0],[-1,-1],[1,-1],[-1,1],[1,1]]){
        const nx=x+dx,ny=y+dy,k=key(nx,ny);if(closed.has(k)||!clear(nx*cell,ny*cell))continue;
        if(dx&&dy&&(!clear((x+dx)*cell,y*cell)||!clear(x*cell,(y+dy)*cell)))continue;
        const g=cost.get(current)+(dx&&dy?Math.SQRT2:1);if(g<(cost.get(k)??Infinity)){parent.set(k,current);cost.set(k,g);open.add(k);}
      }
    }return [];
  }
  return {free,route,obstacles};
}
