import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import * as navigation from '../src/navigation.mjs';
import * as pointerLook from '../src/pointer-look.mjs';
import * as museumLayout from '../src/museum-layout.mjs';
import {withPhysicalSize,artworkFrameBorder} from '../src/artwork-scale.mjs';

// Exercise the actual Gallery picking/bind methods without allocating a WebGL renderer.
async function loadGallery(eyeHeight=2.6){
 const win=new EventTarget(),doc=new EventTarget(),exports={};
 const source=await fs.readFile(new URL('../src/gallery.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={'./sculpture-model':{sculptures:JSON.parse(await fs.readFile(new URL('../src/data/sculptures.json',import.meta.url),'utf8'))},'three':THREE,'./navigation.mjs':navigation,'./pointer-look.mjs':pointerLook,'./museum-layout.mjs':museumLayout,'./ornate-frame':{},'./data/theme':{theme:{room:{width:20,depth:17,margin:1.25},initial:{y:eyeHeight,z:0,yaw:0}}}};
 modules['./bench']={createGalleryBench:()=>new THREE.Group()};
 modules['./render-budget']={batchArchitecture(){}};
 modules['./data/theme'].theme.lighting={ambient:1.3,key:1.1,ceilingGap:.48,railInset:1.4};
 doc.createElement=()=>({width:0,height:0,getContext:()=>new Proxy({},{get:()=>()=>{}})});
 const guideSource=await fs.readFile(new URL('../src/doorway-guide.ts',import.meta.url),'utf8'),guideExports={};
 vm.runInNewContext(ts.transpileModule(guideSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:guideExports,require:id=>modules[id],document:doc});
 modules['./doorway-guide']=guideExports;
 vm.runInNewContext(code,{exports,require:id=>modules[id],window:win,document:doc,AbortController,performance});
 return {Gallery:exports.Gallery,win,doc};
}

function marker(){return {visible:false,point:null,show(point){this.visible=true;this.point=point.clone();},hide(){this.visible=false;}};}
function floorState(g){
 Object.assign(g,{floorPlane:new THREE.Plane(new THREE.Vector3(0,1,0),0),floorBlockers:[],floorMarker:marker(),destinationMarker:marker(),floorWalk:null,
  hoverHighlight:{target:null,visible:false,show(target){this.target=target;this.visible=true;},dismiss(){this.target=null;this.visible=false;},animate(){}},
  mouseControls:{paused:false,suspend(){}},keys:new Set(),touches:new Set(),drag:null,stick:{x:0,y:0},manual:true,suspended:false,onStatus(){},onRoam(){},selected:null,flight:null});
}
function floorGallery(Gallery){
 const g=Object.create(Gallery.prototype);floorState(g);
 const camera=new THREE.PerspectiveCamera(52,800/600,.05,80);camera.position.set(3,2.6,4.3);
 Object.assign(g,{camera,yaw:0,pitch:-.65,pointer:new THREE.Vector2(),ray:new THREE.Raycaster(),targets:[],hung:[],
  renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}},container:{clientWidth:800,clientHeight:600,classList:{toggle(){}}}});
 return g;
}

test('实际建筑在四向门洞处没有实体墙遮挡，转角门外仍有墙且小厅射灯位于天花内',async()=>{
 const {Gallery}=await loadGallery(1.65),g=floorGallery(Gallery);
 Object.assign(g,{scene:new THREE.Scene(),roomRoots:new Map(),pictureLights:[]});g.renderer.capabilities={getMaxAnisotropy:()=>1};
 for(const r of museumLayout.rooms)g.room(r);g.connectRooms();g.scene.updateMatrixWorld(true);
 let guideCount=0;
 for(const room of museumLayout.rooms)for(const door of museumLayout.doorsFor(room.id)){
  const guide=g.roomRoots.get(room.id).children.find(c=>c.name==='doorway-floor-guide'&&c.userData.to===door.next);assert.ok(guide,`${room.id} → ${door.next} 缺少地面导视`);guideCount++;
  assert.equal(guide.children.length,1,'每侧仅保留一个箭头和目标厅名，不显示当前厅');
  for(const name of ['doorway-direction-arrow']){
   const label=guide.getObjectByName(name),bounds=new THREE.Box3().setFromObject(label);
   assert.ok(bounds.min.x>room.x-room.width/2&&bounds.max.x<room.x+room.width/2&&bounds.min.z>room.z-room.depth/2&&bounds.max.z<room.z+room.depth/2,'地面标识不能越墙');
   assert.ok(bounds.min.y>0&&bounds.max.y<.03,'标识应贴地');assert.equal(g.floorBlockers.includes(label),false,'导视不阻挡点击行走');
   assert.ok(new THREE.Vector3(0,0,1).transformDirection(label.matrixWorld).y>.99,'文字正面朝上');
  }
  const arrow=guide.getObjectByName('doorway-direction-arrow'),base=arrow.localToWorld(new THREE.Vector3()),tip=arrow.localToWorld(new THREE.Vector3(0,.48,0));
  assert.ok(g.targets.includes(arrow),'地面箭头可以点击');
  assert.equal(arrow.material.transparent,true);assert.ok(arrow.material.opacity<.5,'标记保持半透明');
  assert.ok(Math.abs((door.passage.axis==='x'?base.z:base.x)-(door.passage.axis==='x'?door.passage.z:door.passage.x))<1e-6,'箭头位于门洞正中');
  const towards=new THREE.Vector3(door.passage.x,base.y,door.passage.z).sub(base).normalize();assert.ok(tip.sub(base).normalize().dot(towards)>.9999,'箭头必须指向本门洞，不能指向侧墙或相反方向');
 }
 assert.equal(guideCount,8,'四道门的往返两面均有导视');
 for(const p of museumLayout.passages){
  const normal=p.axis==='x'?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1),along=new THREE.Vector3(normal.z,0,normal.x);
  for(const sign of [-1,1]){
   const point=new THREE.Vector3(p.x,1.65,p.z),direction=normal.clone().multiplyScalar(sign);
   const ray=new THREE.Raycaster(point.clone().addScaledVector(direction,-.9),direction,0,1.8);
   assert.equal(ray.intersectObjects(g.floorBlockers).length,0,`${p.left} → ${p.right} 门洞应真正敞开`);
   ray.ray.origin.addScaledVector(along,p.width/2+.5);
   assert.ok(ray.intersectObjects(g.floorBlockers).length,`${p.left} → ${p.right} 门外墙面应挡住射线`);
  }
 }
 const r=museumLayout.roomFor('leonardo'),parent=new THREE.Group();parent.position.set(r.x,3.02,r.z);g.scene.add(parent);
 g.pictureLight(parent,2.6,3.36,3.02,r.id,parent.position.clone(),new THREE.Vector3(0,0,1),new THREE.Sphere(parent.position.clone(),2));
 assert.ok(g.pictureLights[0].position.y<r.height&&g.pictureLights[0].position.y>4.5,'射灯随小厅层高降低');
 g.ensureSculpture=async()=>{};
 for(const id of ['sculpture','nefertiti']){
  g.goToRoom(id);const sculpture=museumLayout.sculpturePositions[id];
  assert.ok(museumLayout.isWalkable(g.camera.position));assert.equal(museumLayout.roomAt(g.camera.position).id,id);
  assert.ok(Math.hypot(g.camera.position.x-sculpture.x,g.camera.position.z-sculpture.z)>5,'小雕塑厅初始位置能退后看完整作品');
  assert.equal(g.camera.position.y,1.65);
  g.camera.rotation.set(g.pitch,g.yaw,0,'YXZ');g.camera.updateMatrixWorld();
  for(const y of [0,museumLayout.sculpturePedestalHeight+2.05])assert.ok(Math.abs(new THREE.Vector3(sculpture.x,y,sculpture.z).project(g.camera).y)<.85,'初始视野包含雕塑顶部和底座底部并留有余量');
 }
});

test('八个方向的门口箭头只在点击后沿门洞引导到目标厅中央，墙体遮挡与暂停仍有效',async()=>{
 const {Gallery}=await loadGallery(1.65),g=floorGallery(Gallery);
 Object.assign(g,{scene:new THREE.Scene(),roomRoots:new Map(),pictureLights:[]});g.renderer.capabilities={getMaxAnisotropy:()=>1};
 for(const r of museumLayout.rooms)g.room(r);g.connectRooms();g.scene.updateMatrixWorld(true);
 const aim=point=>{g.yaw=Math.atan2(g.camera.position.x-point.x,g.camera.position.z-point.z);g.pitch=Math.atan2(point.y-g.camera.position.y,Math.hypot(point.x-g.camera.position.x,point.z-g.camera.position.z));};
 for(const room of museumLayout.rooms)for(const door of museumLayout.doorsFor(room.id))for(const center of [true,false]){
  const arrow=g.targets.find(t=>t.userData.kind==='doorway'&&t.userData.from===room.id&&t.userData.to===door.next);
  const target=arrow.getWorldPosition(new THREE.Vector3()),inward=target.clone().sub(new THREE.Vector3(door.passage.x,target.y,door.passage.z)).normalize();
  g.camera.position.copy(target).addScaledVector(inward,2.5);g.camera.position.y=1.65;aim(target);
  const idle=arrow.material.opacity;
  g.pick(400,300,false,center);assert.equal(g.floorWalk,null,'悬停不能启动行走');assert.equal(g.hoveredDoorway,arrow);assert.ok(arrow.material.opacity>idle);
  assert.equal(g.floorMarker.visible,false,'箭头不叠加地板光圈');assert.equal(g.hoverHighlight.visible,false,'箭头不出现矩形边框');
  g.pick(400,300,true,center);const walk=g.floorWalk,next=museumLayout.roomFor(door.next);assert.ok(walk);
  assert.equal(walk.roomId,next.id);assert.deepEqual(walk.end.toArray(),[next.x,1.65,next.z]);
  for(let i=0;i<=100;i++){g.updateFloorWalk(walk.startTime+walk.duration*i/100);assert.ok(museumLayout.isWalkable(g.camera.position),'自动导航不能穿墙或穿过雕塑底座');assert.equal(g.camera.position.y,1.65);}
  g.updateFloorWalk(walk.startTime+walk.duration+1);assert.ok(g.camera.position.distanceTo(walk.end)<1e-6);assert.equal(g.floorWalk,null);
  g.setHover(null);assert.equal(arrow.material.opacity,idle);
  // Even when this arrow is visible from its reverse side, it cannot navigate back to its own room.
  aim(target);g.pick(400,300,false,center);assert.notEqual(g.hoveredDoorway,arrow);g.setHover(null);
 }
 const arrow=g.targets.find(t=>t.userData.from==='rembrandt'&&t.userData.to==='leonardo');
 g.camera.position.set(5,1.65,0);const target=arrow.getWorldPosition(new THREE.Vector3());aim(target);
 const canvas=new EventTarget();canvas.tagName='CANVAS';canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
 g.renderer.domElement=canvas;g.abort=new AbortController();g.mouseControls.dragMode=true;g.bind();
 const idleMap=arrow.material.map,idleOpacity=arrow.material.opacity,position=g.camera.position.clone();
 const hover=()=>{canvas.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'mouse',pointerId:1,clientX:400,clientY:300}));g.updateHover();};
 hover();assert.equal(g.hoveredDoorway,arrow);assert.notEqual(arrow.material.map,idleMap,'普通鼠标悬停显示含厅名的纹理');
 assert.ok(arrow.material.opacity>idleOpacity);assert.equal(g.floorWalk,null);assert.ok(g.camera.position.equals(position),'不按鼠标也能悬停，且不会移动相机');
 g.updateHover();assert.equal(g.hoveredDoorway,arrow,'指针静止时保持高亮');
 canvas.dispatchEvent(new Event('pointerleave'));g.updateHover();assert.equal(g.hoveredDoorway,null);assert.equal(arrow.material.map,idleMap);assert.equal(arrow.material.opacity,idleOpacity);
 hover();g.suspend(true);assert.equal(arrow.material.map,idleMap);assert.equal(g.mousePosition,null);g.suspend(false);g.abort.abort();
 const blocker=new THREE.Mesh(new THREE.BoxGeometry(.3,3,3));blocker.position.set(6.5,1.5,0);blocker.updateMatrixWorld();g.floorBlockers.push(blocker);
 g.pick(400,300,true);assert.equal(g.floorWalk,null,'遮挡时不能点穿墙体选择箭头');assert.equal(g.hoveredDoorway,null);
 g.floorBlockers.pop();g.mouseControls.paused=true;g.pick(400,300,true);assert.equal(g.floorWalk,null,'暂停时点击无效');
 g.mouseControls.paused=false;g.pick(400,300,true);assert.equal(g.floorWalk.roomId,'leonardo');g.suspend(true);assert.equal(g.floorWalk,null);
 blocker.geometry.dispose();blocker.material.dispose();
});

test('两件雕塑本体打开3D细看，展签打开对应介绍，中心射线与直接点按均区分且悬停不打开',async()=>{
 const {Gallery}=await loadGallery(),g=floorGallery(Gallery);
 g.camera.position.set(3,2.6,4.3);g.pitch=0;
 const opened=[];g.onSculpture=id=>opened.push(['3d',id]);g.onSculptureInfo=s=>opened.push(['info',s.id]);
 for(const id of ['crouching-boy','nefertiti'])for(const kind of ['sculpture','sculpture-label'])for(const center of [true,false]){
  const proxy=new THREE.Mesh(new THREE.PlaneGeometry(2,3));proxy.position.set(3,2.6,-4);proxy.userData={id,kind};proxy.updateMatrixWorld();g.targets=[proxy];
  g.pick(400,300,false,center);assert.equal(opened.length,0);
  assert.equal(g.hoverHighlight.visible,kind==='sculpture-label');
  g.pick(400,300,true,center);assert.deepEqual(opened,[[kind==='sculpture'?'3d':'info',id]]);opened.length=0;
  proxy.geometry.dispose();proxy.material.dispose();
 }
});

test('桌面拾取始终命中中心射线对应作品，不受原鼠标点击坐标影响',async()=>{
 const {Gallery}=await loadGallery(),g=Object.create(Gallery.prototype);
 floorState(g);
 const camera=new THREE.PerspectiveCamera(52,800/600,.05,80);camera.position.set(0,2.6,5.5);
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,3),new THREE.MeshBasicMaterial());
 mesh.position.set(0,2.6,-4);mesh.userData={id:'centre',kind:'art'};mesh.updateMatrixWorld();
 const artwork={id:'centre',height:3};let chosen;
 Object.assign(g,{camera,yaw:0,pitch:0,pointer:new THREE.Vector2(),ray:new THREE.Raycaster(),targets:[mesh],hung:[{a:artwork,width:2,frameBorder:.2,center:mesh.position,normal:new THREE.Vector3(0,0,1)}],selected:null,flight:null,
  renderer:{domElement:{getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})}},container:{clientWidth:800,clientHeight:600,classList:{toggle(){}}},focus:id=>{chosen=id;}});
 for(const [x,y]of [[0,0],[799,599],[100,500]]){chosen=null;g.pick(x,y,true,true);assert.equal(chosen,'centre');}
 chosen=null;g.pick(0,0,true,false);assert.equal(chosen,null,'触屏仍按真实点按位置拾取');
 mesh.geometry.dispose();mesh.material.dispose();
});

test('中心瞄准画作或展签给出对应高亮，墙面遮挡和暂停立即清除且悬停不触发点击',async()=>{
 const {Gallery}=await loadGallery(),g=floorGallery(Gallery);
 const art=new THREE.Mesh(new THREE.PlaneGeometry(2,3),new THREE.MeshBasicMaterial());art.position.set(3,2.6,-4);art.userData={id:'hover',kind:'art'};art.updateMatrixWorld();
 const label=new THREE.Mesh(new THREE.PlaneGeometry(.78,.422),new THREE.MeshBasicMaterial());label.position.set(4.6,2,-4);label.userData={id:'hover',kind:'label'};label.updateMatrixWorld();
 const wall=new THREE.Mesh(new THREE.BoxGeometry(4,4,.2));wall.position.set(3.8,2.3,1);wall.updateMatrixWorld();
 const classes=new Map();g.container.classList.toggle=(name,value)=>classes.set(name,value);
 let clicks=0;g.focus=g.onInfo=g.onOpen=()=>clicks++;
 g.targets=[art,label];g.hung=[{a:{id:'hover',height:3},group:art,width:2,frameBorder:.2}];g.pitch=0;
 g.pick(799,599,false,true);assert.equal(g.hoverHighlight.target,art);assert.equal(classes.get('is-hovering-artwork'),true);
 g.yaw=-Math.atan2(1.6,9);g.pitch=Math.atan2(-.6,Math.hypot(1.6,9));g.pick(0,0,false,true);
 assert.equal(g.hoverHighlight.target,label);assert.equal(classes.get('is-hovering-artwork'),false);assert.equal(classes.get('is-hovering-label'),true);
 g.floorBlockers=[wall];g.pick(0,0,false,true);assert.equal(g.hoverHighlight.target,null);assert.equal(classes.get('is-hovering-label'),false);
 g.floorBlockers=[];g.pick(0,0,false,true);g.mouseControls.paused=true;g.pick(0,0,false,true);assert.equal(g.hoverHighlight.visible,false);
 assert.equal(clicks,0);
 for(const mesh of [art,label,wall]){mesh.geometry.dispose();mesh.material.dispose();}
});

test('锁定时聚焦画布仍能WASD行走，退出锁定后按键不会启动移动',async()=>{
 const {Gallery,win}=await loadGallery(),g=Object.create(Gallery.prototype),canvas=new EventTarget();canvas.tagName='CANVAS';
 floorState(g);g.container={classList:{toggle(){}}};
 const controls={paused:false};Object.assign(g,{renderer:{domElement:canvas},abort:new AbortController(),suspended:false,mouseControls:controls,keys:new Set(),selected:null,flight:null,touches:new Set(),stick:{x:0,y:0},drag:null});
 g.bind();
 const key=(type,code)=>{const event=Object.assign(new Event(type),{code});Object.defineProperty(event,'target',{value:canvas});win.dispatchEvent(event);};
 key('keydown','KeyW');assert.ok(g.keys.has('KeyW'));
 key('keyup','KeyW');assert.equal(g.keys.size,0);
 controls.paused=true;key('keydown','KeyW');assert.equal(g.keys.size,0);
 controls.paused=false;key('keydown','KeyD');win.dispatchEvent(new Event('blur'));assert.equal(g.keys.size,0);
 g.abort.abort();
});

test('驻足后鼠标和触屏环顾保持审视，可直接二次点击；暂停保留审视而走动退出',async()=>{
 const {Gallery,win,doc}=await loadGallery(),g=floorGallery(Gallery);
 const art=new THREE.Mesh(new THREE.PlaneGeometry(2,3),new THREE.MeshBasicMaterial());art.position.set(3,2.6,-4);art.userData={id:'study',kind:'art'};art.updateMatrixWorld();
 const h={a:{id:'study',height:3},group:art,width:2,frameBorder:.2,center:art.position.clone(),normal:new THREE.Vector3(0,0,1)};
 g.hung=[h];g.targets=[art];g.selected='study';g.manual=false;g.pitch=0;
 g.camera.position.copy(g.focusPose(h).position);const position=g.camera.position.clone();
 const selections=[];let opened=0;g.onSelect=(_a,ready)=>selections.push(ready);g.onOpen=()=>opened++;
 g.turnView(45,-35);assert.equal(g.manual,false);assert.equal(g.selected,'study');assert.ok(g.camera.position.equals(position));
 g.pick(0,0,true,true);assert.equal(opened,1,'转向超过旧角度阈值后仍直接打开同一幅画');assert.equal(g.flight,null);
 const canvas=new EventTarget();canvas.tagName='CANVAS';canvas.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});g.renderer.domElement=canvas;g.abort=new AbortController();g.bind();
 g.drag={id:1,x:100,y:100,lastX:100,lastY:100,max:0};
 canvas.dispatchEvent(Object.assign(new Event('pointermove'),{pointerType:'touch',pointerId:1,clientX:115,clientY:112}));
 assert.equal(g.manual,false);assert.ok(g.camera.position.equals(position));assert.deepEqual(selections,[]);
 const press=code=>{const event=Object.assign(new Event('keydown'),{code});Object.defineProperty(event,'target',{value:canvas});win.dispatchEvent(event);};
 press('Escape');win.dispatchEvent(new Event('blur'));doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));doc.hidden=false;
 assert.equal(g.manual,false);assert.deepEqual(selections,[],'暂停、失焦与后台不离开已经完成的驻足');
 press('KeyW');assert.equal(g.manual,true);assert.deepEqual(selections,[false]);
 g.abort.abort();art.geometry.dispose();art.material.dispose();
});

test('地板光圈使用中心射线，指向画作或无效位置时消失',async()=>{
 const {Gallery}=await loadGallery(),g=floorGallery(Gallery);
 g.pick(0,0,false,true);assert.equal(g.floorMarker.visible,true);
 const point=g.floorMarker.point.clone();assert.ok(Math.abs(point.z-(4.3-2.6/Math.tan(.65)))<1e-6);
 g.pick(799,599,false,true);assert.ok(g.floorMarker.point.distanceTo(point)<1e-6,'原鼠标坐标不改变中心目标');
 assert.equal(g.floorWalk,null,'悬停不会启动移动');
 const seat=museumLayout.benchPosition(museumLayout.rooms[0]);
 for(const [x,pitch] of [[3,0],[3,.4],[3,-.1],[seat.x,-Math.atan2(2.6,5-seat.z)]]) {
  g.camera.position.set(x,2.6,5);g.pitch=pitch;g.pick(0,0,true,true);
  assert.equal(g.floorMarker.visible,false);assert.equal(g.floorWalk,null,'抬头、墙外或长凳下均不可选择');
 }
});

test('点击光圈平滑到达目标，保留眼高和看向，连续点击从当前位置重新出发',async()=>{
 const {Gallery}=await loadGallery(),g=floorGallery(Gallery);let cleared=0;g.onRoam=()=>cleared++;
 g.pick(799,0,true,true);const first=g.floorWalk;
 assert.ok(first);assert.equal(cleared,1);assert.equal(first.end.y,2.6);assert.equal(g.destinationMarker.visible,true);
 g.updateFloorWalk(first.startTime+first.duration/2);
 assert.ok(g.camera.position.distanceTo(first.start.clone().lerp(first.end,.5))<1e-6);
 g.yaw=.3;g.pitch=-.8;g.pick(0,0,true,true);const second=g.floorWalk;
 assert.notEqual(second,first);assert.ok(second.start.distanceTo(g.camera.position)<1e-6);
 g.updateFloorWalk(second.startTime+second.duration+1);
 assert.ok(g.camera.position.distanceTo(second.end)<1e-6);assert.equal(g.camera.position.y,2.6);
 assert.equal(g.yaw,.3);assert.equal(g.pitch,-.8);assert.equal(g.floorWalk,null);assert.equal(g.destinationMarker.visible,false);
});

test('遮挡物不允许透过长凳选择地板，展签优先打开介绍',async()=>{
 const {Gallery}=await loadGallery(),g=floorGallery(Gallery);
 const blocker=new THREE.Mesh(new THREE.BoxGeometry(1,1.5,.5));blocker.position.set(3,.75,2.8);blocker.updateMatrixWorld();g.floorBlockers=[blocker];
 g.pick(0,0,true,true);assert.equal(g.floorMarker.visible,false);assert.equal(g.floorWalk,null);
 g.floorBlockers=[];
 const label=new THREE.Mesh(new THREE.PlaneGeometry(1,1));label.position.set(3,1.2,3);label.userData={id:'label',kind:'label'};label.updateMatrixWorld();
 g.targets=[label];const artwork={id:'label'};g.hung=[{a:artwork}];let opened;g.onInfo=a=>opened=a;
 g.pick(0,0,true,true);assert.equal(opened,artwork);assert.equal(g.floorWalk,null);assert.equal(g.floorMarker.visible,false);
 blocker.geometry.dispose();blocker.material.dispose();label.geometry.dispose();label.material.dispose();
});

test('暂停、手动移动和失焦停止地板自动行走，暂停时点击无效',async()=>{
 const {Gallery,win}=await loadGallery(),g=floorGallery(Gallery);
 g.pick(0,0,true,true);g.suspend(true);assert.equal(g.floorWalk,null);assert.equal(g.destinationMarker.visible,false);
 g.pick(0,0,true,true);assert.equal(g.floorWalk,null);
 g.suspend(false);g.mouseControls.paused=true;g.pick(0,0,true,true);assert.equal(g.floorWalk,null);
 g.mouseControls.paused=false;g.pick(0,0,true,true);g.setStick(.5,0);assert.equal(g.floorWalk,null);
 const canvas=new EventTarget();canvas.tagName='CANVAS';g.renderer.domElement=canvas;g.abort=new AbortController();g.touches=new Set();g.drag=null;g.bind();
 g.walkTo(new THREE.Vector3(3,0,1));
 const key=Object.assign(new Event('keydown'),{code:'KeyW'});Object.defineProperty(key,'target',{value:canvas});win.dispatchEvent(key);
 assert.equal(g.floorWalk,null);assert.ok(g.keys.has('KeyW'));
 g.walkTo(new THREE.Vector3(3,0,1));win.dispatchEvent(new Event('blur'));assert.equal(g.floorWalk,null);assert.equal(g.destinationMarker.visible,false);
 g.abort.abort();
});
test('第二厅地板可选择，跨厅行走沿门口路线且回到中央保留所在展厅',async()=>{
 const {Gallery}=await loadGallery(),g=floorGallery(Gallery);
 g.camera.position.set(museumLayout.rooms[1].x,2.6,5);g.pick(0,0,false,true);assert.equal(g.floorMarker.visible,true);
 const end=new THREE.Vector3(4,0,5);g.walkTo(end);const walk=g.floorWalk;assert.ok(walk.route.length>1);
 for(let i=0;i<=100;i++){g.updateFloorWalk(walk.startTime+walk.duration*i/100);assert.ok(museumLayout.isWalkable(g.camera.position));assert.equal(g.camera.position.y,2.6);}
 assert.ok(g.camera.position.distanceTo(new THREE.Vector3(end.x,2.6,end.z))<1e-6);
 g.camera.position.set(museumLayout.rooms[1].x,2.6,-4);g.reset();assert.deepEqual(g.camera.position.toArray(),[museumLayout.rooms[1].x,2.6,0]);
 g.camera.position.set(3,2.6,-4);g.reset();assert.deepEqual(g.camera.position.toArray(),[0,2.6,0]);
});
test('点击地板比普通步行更快，同厅与跨厅靠近画作都比地板导航更快且沿门洞路线行进',async()=>{
 const {Gallery}=await loadGallery();
 for(const room of [museumLayout.rooms[0],museumLayout.rooms[1]]){
  const g=floorGallery(Gallery);g.camera.position.set(4,2.6,-4.8);g.onSelect=()=>{};
  const h={a:{id:'speed-check',title:'速度检查',height:2.4,room:room.id},width:2,frameBorder:.22,center:new THREE.Vector3(room.x,2.6,-room.depth/2+.14),normal:new THREE.Vector3(0,0,1)};
  g.hung=[h];const pose=g.focusPose(h);g.walkTo(pose.position);const walk=g.floorWalk;
  assert.ok(walk);const length=g.routeLength(g.camera.position,walk.route);
  assert.ok(walk.duration<length/2.65*1000*.5,'地板导航耗时少于原步行的一半');
  g.focus(h.a.id);const flight=g.flight;
  assert.ok(flight);assert.equal(g.floorWalk,null);assert.ok(flight.duration<=walk.duration*.5,'画作靠近耗时最多为同路线地板导航的一半');
  for(let i=0;i<=100;i++)assert.ok(museumLayout.isWalkable(museumLayout.positionOnRoute(flight.start,flight.route,i/100)));
  if(room.id==='rembrandt')assert.ok(flight.duration<1050,'同厅靠近不再固定等待1.05秒');
  else assert.ok(flight.route.length>1,'跨厅加速仍走门洞，不直线穿墙');
 }
});
test('原作尺寸的全部画作在横竖屏驻足时保持成人眼高、对准画心并保留完整画框',async()=>{
 const {Gallery}=await loadGallery(1.65),g=floorGallery(Gallery),data=JSON.parse(await fs.readFile(new URL('../src/data/artworks.json',import.meta.url),'utf8')).map(withPhysicalSize);
 for(const [width,height]of [[1280,720],[390,844],[844,390]]){
  g.container.clientWidth=width;g.container.clientHeight=height;g.camera.aspect=width/height;
  for(const a of data){
   const r=museumLayout.roomFor(a.room),normal={north:new THREE.Vector3(0,0,1),south:new THREE.Vector3(0,0,-1),east:new THREE.Vector3(-1,0,0),west:new THREE.Vector3(1,0,0)}[a.wall];
   const center=new THREE.Vector3(r.x-normal.x*r.width/2,a.centerY,r.z-normal.z*r.depth/2).addScaledVector(normal,.14).addScaledVector(new THREE.Vector3(normal.z,0,-normal.x),a.offset);
   const h={a,normal,center,width:a.width,frameBorder:artworkFrameBorder(a.width,a.height)};
   const pose=g.focusPose(h),distance=pose.position.clone().sub(center).dot(normal),visibleHeight=2*distance*Math.tan(g.camera.fov*Math.PI/360);
   assert.ok(museumLayout.isWalkable(pose.position),`${a.id} 驻足位置应可行走`);
   assert.equal(pose.position.y,1.65,'靠近小幅画不会降低身体，靠近大幅画不会升高身体');
   const camera=new THREE.PerspectiveCamera(52,width/height,.05,80);camera.position.copy(pose.position);camera.rotation.set(pose.pitch,pose.yaw,0,'YXZ');camera.updateMatrixWorld();
   const target=center.clone().project(camera);assert.ok(Math.abs(target.x)<1e-6&&Math.abs(target.y)<1e-6,`${a.id} 看向画心`);
   const horizontal=new THREE.Vector3(normal.z,0,-normal.x);
   for(const x of [-1,1])for(const y of [-1,1]){
    const corner=center.clone().addScaledVector(horizontal,x*(a.width/2+h.frameBorder));corner.y+=y*(a.height/2+h.frameBorder);corner.project(camera);
    assert.ok(Math.abs(corner.x)<.8&&Math.abs(corner.y)<.8,`${width}×${height} ${a.id} 画框四角留白`);
   }
   assert.ok((h.width+h.frameBorder*2)<visibleHeight*g.camera.aspect*.8,`${width}×${height} ${a.id} 画框宽度应留白`);
   assert.ok((a.height+h.frameBorder*2)<visibleHeight*.8,`${width}×${height} ${a.id} 画框高度应留白`);
  }
 }
});
test('Esc暂停后的静止画面不重复绘制，纹理完成、相机改变和恢复漫游会重绘',async()=>{
 const {Gallery,doc}=await loadGallery(),g=floorGallery(Gallery);let renders=0;
 Object.assign(g,{clock:{getDelta:()=>.016},renderDirty:true,lastRenderPosition:new THREE.Vector3(Infinity,Infinity,Infinity),lastRenderYaw:NaN,lastRenderPitch:NaN,lodClock:0,updateVisibility(){},renderer:{render(){renders++;}},scene:new THREE.Scene()});
 g.floorMarker.animate=g.destinationMarker.animate=()=>{};
 g.mouseControls.paused=true;
 g.frame();g.frame();assert.equal(renders,1);
 g.renderDirty=true;g.frame();assert.equal(renders,2,'异步纹理/尺寸更新触发重绘');
 g.camera.position.x+=1;g.frame();assert.equal(renders,3);
 g.mouseControls.paused=false;g.frame();g.frame();assert.equal(renders,5);
 g.suspended=true;g.frame();assert.equal(renders,5);g.suspended=false;doc.hidden=true;g.frame();assert.equal(renders,5,'后台不继续绘制');
 const canvas=new EventTarget();canvas.tagName='CANVAS';g.renderer.domElement=canvas;g.abort=new AbortController();g.bind();
 g.mouseControls.paused=true;doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));g.frame();assert.equal(renders,6,'恢复前台时重绘一次');
 canvas.dispatchEvent(new Event('webglcontextrestored'));g.frame();assert.equal(renders,7,'恢复图形上下文后重绘');g.abort.abort();
});
