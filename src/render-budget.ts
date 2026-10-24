import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rooms,passages,doorsFor,roomAt} from './museum-layout.mjs';

const gates=new Map(passages.map(p=>{const dx=p.axis==='x'?p.length/2+.12:p.width/2,dz=p.axis==='z'?p.length/2+.12:p.width/2;return [p,new THREE.Box3(new THREE.Vector3(p.x-dx,0,p.z-dz),new THREE.Vector3(p.x+dx,p.height,p.z+dz))];}));
/** Conservatively reveal connected rooms only through portals inside the view. */
export function visibleRooms(position:THREE.Vector3,frustum:THREE.Frustum){
 const current=roomAt(position);
 const crossing=passages.find(p=>p.axis==='x'?Math.abs(position.x-p.x)<=p.length/2+.01&&Math.abs(position.z-p.z)<p.width/2:Math.abs(position.z-p.z)<=p.length/2+.01&&Math.abs(position.x-p.x)<p.width/2);
 const visible=new Set<string>(current?[current.id]:crossing?[crossing.left,crossing.right]:rooms.map(r=>r.id));
 const pending=[...visible];
 while(pending.length){for(const door of doorsFor(pending.shift()!))if(!visible.has(door.next)&&frustum.intersectsBox(gates.get(door.passage)!)){visible.add(door.next);pending.push(door.next);}}
 return visible;
}

/** Retain the detached wall meshes for ray picking, with their cached world matrices. */
export function batchArchitecture(meshes:THREE.Mesh<THREE.BoxGeometry,THREE.Material>[],parent:THREE.Group,blockers:Set<THREE.Object3D>){
 const batches=new Map<THREE.Material,typeof meshes>();
 for(const mesh of meshes){const list=batches.get(mesh.material)??[];list.push(mesh);batches.set(mesh.material,list);}
 parent.updateMatrixWorld(true);
 for(const [material,list] of batches){
  if(list.length<2)continue;
  const geometries=list.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
  const merged=mergeGeometries(geometries,false)!;geometries.forEach(g=>g.dispose());
  for(const mesh of list){parent.remove(mesh);if(!blockers.has(mesh))mesh.geometry.dispose();}
  const mesh=new THREE.Mesh(merged,material);mesh.name='batched-room-architecture';parent.add(mesh);
 }
 parent.updateMatrixWorld(true);
}

export interface PictureLight {
 room:string;position:THREE.Vector3;target:THREE.Vector3;angle:number;center:THREE.Vector3;normal:THREE.Vector3;sphere:THREE.Sphere;
}
/** Constant light count avoids compiling a new shader when crossing a doorway. */
export class PictureLightPool {
 readonly lights:THREE.SpotLight[];
 private offset=new THREE.Vector3();private projected=new THREE.Vector3();
 constructor(scene:THREE.Scene,count=4){
  this.lights=Array.from({length:count},()=>{
   const light=new THREE.SpotLight(0xffdda7,0,9,.5,.65,2);scene.add(light,light.target);return light;
  });
 }
 update(candidates:PictureLight[],camera:THREE.Camera,frustum:THREE.Frustum,visible:Set<string>,intensity:number){
  const chosen=candidates.filter(p=>visible.has(p.room)&&frustum.intersectsSphere(p.sphere)&&p.normal.dot(this.offset.subVectors(camera.position,p.center))>0)
   .map(p=>{const screen=this.projected.copy(p.center).project(camera);const edge=Math.max(0,Math.abs(screen.x)-.85)**2+Math.max(0,Math.abs(screen.y)-.85)**2;return {picture:p,score:camera.position.distanceToSquared(p.center)*(1+12*edge)};})
   .sort((a,b)=>a.score-b.score).slice(0,this.lights.length).map(p=>p.picture);
  this.lights.forEach((light,i)=>{
   const picture=chosen[i];light.intensity=picture?intensity:0;
   if(picture){light.position.copy(picture.position);light.target.position.copy(picture.target);light.angle=picture.angle;}
  });
 }
}
