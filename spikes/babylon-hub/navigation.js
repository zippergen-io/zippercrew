import {v} from './geometry.js';

// A small deterministic occupancy grid is enough for this single-room spike.
// It plans around expanded furniture footprints and other people's actual bodies.
export function planPath(start,goal,person,world,people) {
  const step=.2,xmin=-5.05,zmin=-3.05,nx=51,nz=31;
  const cell=p=>[Math.max(0,Math.min(nx-1,Math.round((p.x-xmin)/step))),Math.max(0,Math.min(nz-1,Math.round((p.z-zmin)/step)))];
  const point=(x,z)=>v(xmin+x*step,0,zmin+z*step),key=(x,z)=>z*nx+x;
  const clear=(x,z)=>{
    const p=point(x,z),r=person.radius;
    for(const o of world.obstacles)if(Math.abs(p.x-o.x)<o.w/2+r&&Math.abs(p.z-o.z)<o.d/2+r)return false;
    for(const other of people.values())if(other!==person&&Math.hypot(p.x-other.root.position.x,p.z-other.root.position.z)<r+other.radius+.06)return false;
    return true;
  };
  const [sx,sz]=cell(start),[gx,gz]=cell(goal),sk=key(sx,sz),gk=key(gx,gz);
  const open=[{x:sx,z:sz,k:sk,g:0,f:0}],cost=new Map([[sk,0]]),parents=new Map(),closed=new Set();
  while(open.length) {
    open.sort((a,b)=>b.f-a.f);const cur=open.pop();if(closed.has(cur.k))continue;
    if(cur.k===gk) {
      const path=[goal.clone()];let k=gk;
      while(k!==sk){path.push(point(k%nx,Math.floor(k/nx)));k=parents.get(k);}
      path.reverse();return path;
    }
    closed.add(cur.k);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const x=cur.x+dx,z=cur.z+dz,k=key(x,z);
      if(x<0||x>=nx||z<0||z>=nz||closed.has(k)||!clear(x,z))continue;
      if(dx&&dz&&(!clear(cur.x+dx,cur.z)||!clear(cur.x,cur.z+dz)))continue;
      const g=cur.g+Math.hypot(dx,dz);
      if(g>=(cost.get(k)??Infinity))continue;
      cost.set(k,g);parents.set(k,cur.k);open.push({x,z,k,g,f:g+Math.hypot(gx-x,gz-z)});
    }
  }
  return []; // Occupied destinations wait; never teleport through an obstacle.
}

export function navigate(p,station,world,people) {
  p.destination=station;p.route=[];
  const first=planPath(p.root.position,station.approach,p,world,people);
  if(!first.length)return false;
  const second=planPath(station.approach,station.working,p,world,people);
  if(!second.length)return false;
  p.route=[...first,...second];p.blockedFor=0;return true;
}

function turn(p,target,dt) {
  const delta=Math.atan2(Math.sin(target-p.root.rotation.y),Math.cos(target-p.root.rotation.y));
  p.root.rotation.y+=delta*(1-Math.exp(-dt*(p.id==='reviewer'?5:9)));
}
export function move(p,dt,world,people) {
  if(!p.route.length){if(p.destination)turn(p,p.destination.rotation,dt);return;}
  const target=p.route[0],delta=target.subtract(p.root.position),dist=delta.length();
  if(dist<.025){p.root.position.copyFrom(target);p.route.shift();return;}
  const next=p.root.position.add(delta.scale(Math.min(1,p.speed*dt/dist)));
  const collision=[...people.values()].some(o=>o!==p&&Math.hypot(next.x-o.root.position.x,next.z-o.root.position.z)<p.radius+o.radius+.025);
  if(collision){p.blockedFor+=dt;if(p.blockedFor>1&&p.destination){navigate(p,p.destination,world,people);}return;}
  p.blockedFor=0;p.root.position.copyFrom(next);turn(p,Math.atan2(-delta.x,-delta.z),dt);
}
