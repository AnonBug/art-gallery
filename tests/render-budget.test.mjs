import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import * as layout from '../src/museum-layout.mjs';

const source=await fs.readFile(new URL('../src/render-budget.ts',import.meta.url),'utf8'),exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:id=>({'three':THREE,'three/addons/utils/BufferGeometryUtils.js':{mergeGeometries},'./museum-layout.mjs':layout}[id])});
const {visibleRooms,batchArchitecture,PictureLightPool}=exports;
function view(x,z,yaw=0){const camera=new THREE.PerspectiveCamera(52,1280/720,.05,80);camera.position.set(x,2.6,z);camera.rotation.set(0,yaw,0,'YXZ');camera.updateMatrixWorld();return {camera,frustum:new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse))};}

test('只有门洞进入视野时才绘制相邻展厅，薄墙门洞中双厅可见',()=>{
 for(const [x,z,yaw,ids]of [[0,3.8,0,['rembrandt']],[layout.rooms[1].x,3.8,0,['market']],[-2.5,layout.passage.z,Math.PI/2,['market','rembrandt']],[layout.rooms[1].x+4,layout.passage.z,-Math.PI/2,['market','rembrandt','leonardo','sculpture','nefertiti']],[layout.passage.x,layout.passage.z,0,['market','rembrandt']],[layout.rooms[2].x,3.8,0,['leonardo']],[layout.rooms[3].x,layout.rooms[3].z,Math.PI/2,['sculpture']],[layout.rooms[4].x,layout.rooms[4].z,Math.PI/2,['nefertiti']]]){
  const {camera,frustum}=view(x,z,yaw);assert.deepEqual([...visibleRooms(camera.position,frustum)].sort(),ids.sort());
 }
});
test('转角南北门洞中可见相连双厅，达芬奇厅转向右侧时显露雕塑翼',()=>{
 for(const p of layout.passages.filter(p=>p.axis==='z')){
  const {camera,frustum}=view(p.x,p.z,-Math.PI/2);
  const visible=visibleRooms(camera.position,frustum);assert.ok(visible.has(p.left)&&visible.has(p.right));
 }
 const r=layout.rooms[2],north=view(r.x,r.z,0),south=view(r.x,r.z,Math.PI);
 assert.equal(visibleRooms(north.camera.position,north.frustum).has('sculpture'),false);
 assert.ok(visibleRooms(south.camera.position,south.frustum).has('sculpture'));
});
test('按材质合并静态建筑，同时保留墙体世界位置与拾取遮挡',()=>{
 const root=new THREE.Group();root.position.x=-30;
 const material=new THREE.MeshStandardMaterial(),pieces=[];
 for(const z of [-3,0,3]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,6,2),material);mesh.position.set(14,3,z);root.add(mesh);pieces.push(mesh);}
 root.updateMatrixWorld(true);const blocker=pieces[1],before=blocker.matrixWorld.clone();
 batchArchitecture(pieces,root,new Set([blocker]));
 assert.equal(root.children.length,1);assert.equal(root.children[0].name,'batched-room-architecture');assert.ok(blocker.matrixWorld.equals(before));
 const ray=new THREE.Raycaster(new THREE.Vector3(-20,2.6,0),new THREE.Vector3(1,0,0));
 assert.ok(Math.abs(ray.intersectObject(blocker)[0].point.x-(-16.1))<1e-6);
 const mergedHit=ray.intersectObject(root.children[0])[0];assert.ok(Math.abs(mergedHit.point.x-(-16.1))<1e-6);
});
test('25幅画共享固定4盏射灯，隐藏展厅、画背和视野外的作品不占灯位',()=>{
 const scene=new THREE.Scene(),pool=new PictureLightPool(scene),{camera,frustum}=view(0,5.5);
 const picture=(x,z,room='rembrandt',normal=new THREE.Vector3(0,0,1))=>({room,center:new THREE.Vector3(x,2.6,z),position:new THREE.Vector3(x,5,z+1),target:new THREE.Vector3(x,2.6,z),normal,sphere:new THREE.Sphere(new THREE.Vector3(x,2.6,z),1),angle:.5});
 const candidates=[picture(0,-8),picture(-3,-8),picture(3,-8),picture(5,-8),...Array.from({length:21},()=>picture(0,-4,'market'))];
 pool.update(candidates,camera,frustum,new Set(['rembrandt']),48);
 assert.equal(pool.lights.length,4);assert.equal(pool.lights.filter(l=>l.intensity===48).length,4);assert.ok(pool.lights.every(l=>l.target.position.z===-8));
 pool.update([picture(0,-8,'rembrandt',new THREE.Vector3(0,0,-1)),picture(30,-8)],camera,frustum,new Set(['rembrandt']),48);
 assert.ok(pool.lights.every(l=>l.intensity===0));assert.equal(scene.children.filter(o=>o.isSpotLight).length,4,'没有因转向或跨厅增删光源');
});
