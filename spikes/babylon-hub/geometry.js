/* Small authored mesh vocabulary; no textures or inherited character assets. */
export const B = window.BABYLON;
export const v = (x=0,y=0,z=0) => new B.Vector3(x,y,z);
let scene, shadows;
export function setupGeometry(s, shadow) { scene=s; shadows=shadow; }
export function material(name,hex) {
  const m=new B.StandardMaterial(name,scene);
  m.diffuseColor=B.Color3.FromHexString(hex);m.specularColor=B.Color3.Black();
  return m;
}
export function node(name,parent,position=v()) {
  const n=new B.TransformNode(name,scene);n.parent=parent;n.position.copyFrom(position);return n;
}
function finish(mesh,mat,parent,pos,cast=true) {
  mesh.material=mat;mesh.parent=parent;mesh.position.copyFrom(pos);mesh.receiveShadows=true;
  if(cast)shadows.addShadowCaster(mesh);return mesh;
}
export function box(name,size,mat,parent,pos=v(),cast=true) {
  return finish(B.MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},scene),mat,parent,pos,cast);
}
export function ellipsoid(name,size,mat,parent,pos=v(),segments=Math.max(...size)<.3?8:14) {
  return finish(B.MeshBuilder.CreateSphere(name,{diameterX:size[0],diameterY:size[1],diameterZ:size[2],segments},scene),mat,parent,pos);
}
export function cylinder(name,diameter,height,mat,parent,pos=v(),top=diameter) {
  return finish(B.MeshBuilder.CreateCylinder(name,{diameter,diameterTop:top,height,tessellation:24},scene),mat,parent,pos);
}
export function tube(name,points,radius,mat,parent) {
  const path=B.Curve3.CreateCatmullRomSpline(points.map(p=>v(...p)),8).getPoints();
  return finish(B.MeshBuilder.CreateTube(name,{path,radius,tessellation:12,cap:B.Mesh.CAP_ALL},scene),mat,parent,v());
}
// An elliptical ring sculpture, with Catmull-Rom profiles and asymmetric offsets.
// Profile entries: height, horizontal radius, depth radius, x offset, z offset.
export function sculpture(name,profile,mat,parent,position=v()) {
  const rings=[],steps=5,sides=32,positions=[],indices=[],normals=[];
  for(let i=0;i<profile.length-1;i++)for(let j=0;j<steps;j++) {
    const t=j/steps,a=profile[Math.max(0,i-1)],b=profile[i],c=profile[i+1],d=profile[Math.min(profile.length-1,i+2)];
    rings.push(b.map((x,k)=>.5*((2*x)+(-a[k]+c[k])*t+(2*a[k]-5*x+4*c[k]-d[k])*t*t+(-a[k]+3*x-3*c[k]+d[k])*t*t*t)));
  }
  rings.push(profile.at(-1));
  for(const [y,rx,rz,cx,cz] of rings)for(let j=0;j<=sides;j++) {
    const a=j/sides*Math.PI*2;positions.push((cx||0)+Math.max(.001,rx)*Math.cos(a),y,(cz||0)+Math.max(.001,rz)*Math.sin(a));
  }
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<sides;j++) {
    const a=i*(sides+1)+j,b=a+1,c=a+sides+1,d=c+1;indices.push(a,b,c,b,d,c);
  }
  B.VertexData.ComputeNormals(positions,indices,normals);
  // Average the duplicated seam normals so matte highlights remain continuous.
  for(let i=0;i<rings.length;i++)for(let k=0;k<3;k++) {
    const a=(i*(sides+1))*3+k,b=(i*(sides+1)+sides)*3+k,n=(normals[a]+normals[b])/2;normals[a]=normals[b]=n;
  }
  const mesh=new B.Mesh(name,scene),data=new B.VertexData();
  Object.assign(data,{positions,indices,normals});data.applyToMesh(mesh);
  return finish(mesh,mat,parent,position);
}
export function limb(name,radius,mat,parent) {return cylinder(name,radius*2,1,mat,parent);}
export function between(mesh,a,b) {
  const d=b.subtract(a);mesh.position.copyFrom(a.add(b).scale(.5));mesh.scaling.y=d.length();
  mesh.rotationQuaternion=B.Quaternion.FromUnitVectorsToRef(B.Axis.Y,d.normalize(),mesh.rotationQuaternion||new B.Quaternion());
}
export function pill(name,width,depth,height,mat,parent,pos) {
  return sculpture(name,[[0,.001,.001,0,0],[.015,width/2-.035,depth/2-.035,0,0],[height*.3,width/2,depth/2,0,0],[height*.7,width/2,depth/2,0,0],[height-.01,width/2-.025,depth/2-.025,0,0],[height,width/2-.045,depth/2-.045,0,0],[height,.001,.001,0,0]],mat,parent,pos);
}
