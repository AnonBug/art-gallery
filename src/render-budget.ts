import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {rooms,passage,roomAt} from './museum-layout.mjs';

const gates=rooms.map(r=>{
 const x=r.x+(r.door==='west'?-1:1)*r.width/2;
 return new THREE.Box3(new THREE.Vector3(x-.12,0,passage.z-passage.width/2),new THREE.Vector3(x+.12,passage.height,passage.z+passage.width/2));
});
/** The other room can only be seen through the doorway on this room's wall. */
export function visibleRooms(position:THREE.Vector3,frustum:THREE.Frustum){
 const current=roomAt(position);
 if(!current)return new Set(rooms.map(r=>r.id));
 const index=rooms.indexOf(current);
 return new Set(rooms.filter((r,i)=>i===index||frustum.intersectsBox(gates[index])).map(r=>r.id));
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
