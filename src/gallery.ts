import * as THREE from 'three';
import { theme } from './data/theme';
import { fitDistance, shortestAngle, clamp, canOpen, mouseLook, moveDuration } from './navigation.mjs';
import type { Artwork } from './types';
import {OrnateFrames} from './ornate-frame';
import {createGalleryBench} from './bench';
import {createArtworkLabel} from './artwork-label';
import {FloorMarker} from './floor-marker';
import {HoverHighlight} from './hover-highlight';
import {createDoorwayGuide,type DoorwayTarget} from './doorway-guide';
import {installPointerLook} from './pointer-look.mjs';
import {rooms,passages,doorsFor,roomFor,roomAt,sculpturePositions,sculpturePedestalHeight,benchPosition,isWalkable,projectToFloor,moveOnFloor,planWalk,positionOnRoute} from './museum-layout.mjs';
import {loadSculpture,sculptures,type Sculpture} from './sculpture-model';
import {createSculpturePedestal} from './sculpture-pedestal';
import {batchArchitecture,visibleRooms,PictureLightPool,type PictureLight} from './render-budget';
interface Hung {a:Artwork; group:THREE.Group; center:THREE.Vector3; normal:THREE.Vector3; width:number; frameBorder:number; mesh:THREE.Mesh; detail:THREE.Group; sphere:THREE.Sphere;lod:number; textures:Map<number,THREE.Texture>}
interface Flight {start:THREE.Vector3;end:THREE.Vector3;fromYaw:number;toYaw:number;fromPitch:number;toPitch:number;startTime:number;id:string;route:{x:number;z:number}[];duration:number}
interface FloorWalk {roomId?:string;start:THREE.Vector3;end:THREE.Vector3;startTime:number;duration:number;route:{x:number;z:number}[]}
export class Gallery {
 readonly renderer: THREE.WebGLRenderer;
 readonly camera=new THREE.PerspectiveCamera(52,1,.05,80);
 private scene=new THREE.Scene();private hung: Hung[]=[];private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();
 private targets:THREE.Object3D[]=[];private clock=new THREE.Clock();private yaw=0;private pitch=0;
 private keys=new Set<string>();private stick={x:0,y:0};private flight:Flight|null=null;private selected:string|null=null;
 private drag:{id:number;x:number;y:number;lastX:number;lastY:number;max:number}|null=null;
 private mousePosition:{x:number;y:number}|null=null;
 private touches=new Set<number>();private suspended=false;private lodClock=0;private manual=false;
 private mouseControls:ReturnType<typeof installPointerLook>;
 private pointerLockError:string|null=null;
 private abort=new AbortController();private observer:ResizeObserver;
 private frames:OrnateFrames;
 private floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 private floorBlockers:THREE.Object3D[]=[];
 private floorMarker=new FloorMarker();private destinationMarker=new FloorMarker(true);
 private hoverHighlight=new HoverHighlight(matchMedia('(prefers-reduced-motion: reduce)').matches);
 private floorWalk:FloorWalk|null=null;private hoveredDoorway:DoorwayTarget|null=null;
 private roomRoots=new Map<string,THREE.Group>();private viewProjection=new THREE.Matrix4();private frustum=new THREE.Frustum();
 private pictureLights:PictureLight[]=[];private lightPool:PictureLightPool;
 private activeRooms=new Set<string>();private lightingClock=1;
 private renderDirty=true;private lastRenderPosition=new THREE.Vector3(Infinity,Infinity,Infinity);private lastRenderYaw=NaN;private lastRenderPitch=NaN;
 private sculptureDisplays=new Map<string,{root:THREE.Group;loading:Promise<void>|null;state:string}>();
 constructor(private container:HTMLElement, artworks:Artwork[], private onSelect:(a:Artwork,arrived:boolean,moving:boolean)=>void,private onOpen:(a:Artwork)=>void,private onInfo:(a:Artwork)=>void,private onStatus:(text:string)=>void,private onMouseMode:(locked:boolean,enabled:boolean)=>void,private onRoam:()=>void=()=>{},private onSculpture:(id:string)=>void=()=>{},private onSculptureInfo:(sculpture:Sculpture)=>void=()=>{}){
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  this.frames=new OrnateFrames(theme.frame,this.renderer.capabilities.getMaxAnisotropy());
  this.lightPool=new PictureLightPool(this.scene);
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setClearColor(0x18392e);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
  container.append(this.renderer.domElement);this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','3D展厅，点击进入后隐藏鼠标，上下左右移动鼠标转向，中心瞄准地板出现光圈，点击光圈走过去；点击门口箭头走到下一展厅中央；点击画作驻足，点击展签读介绍，Esc显示鼠标并暂停漫游');
  this.camera.position.set(theme.initial.x,theme.initial.y,theme.initial.z);this.camera.rotation.order='YXZ';this.yaw=theme.initial.yaw;
  this.mouseControls=installPointerLook(this.renderer.domElement,{
   onMove:(dx:number,dy:number)=>this.turnView(dx,dy),
   onClick:()=>this.pick(0,0,true,true),
   onChange:(locked:boolean,enabled:boolean)=>{this.renderDirty=true;this.clearInput();if(locked){this.pointerLockError=null;this.renderer.domElement.focus({preventScroll:true});}if(!locked&&enabled&&(this.flight||this.floorWalk))this.cancel();this.onMouseMode(locked,enabled);},
   onError:(error:unknown)=>{if(error instanceof Error)this.pointerLockError=`${error.name}: ${error.message} (canvas connected: ${this.renderer.domElement.isConnected})`;else this.pointerLockError??='浏览器拒绝鼠标锁定';this.mouseControls.useDrag();this.onStatus('浏览器未允许鼠标锁定，已切换为拖动看向 · WASD 移动 · 点击作品');},
  },matchMedia('(pointer:fine)').matches);
  rooms.forEach(r=>this.room(r));this.connectRooms();this.scene.add(this.floorMarker,this.destinationMarker,this.hoverHighlight);artworks.forEach(a=>this.hang(a));sculptures.forEach(s=>this.sculpture(s));this.bind();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.renderer.setAnimationLoop(()=>this.frame());
 }
 get state(){return {room:roomAt(this.camera.position)?.id??'passage',position:this.camera.position.toArray(),yaw:this.yaw,pitch:this.pitch,selected:this.selected,moving:!!(this.flight||this.floorWalk),floorDestination:this.floorWalk?.end.toArray()??null,suspended:this.suspended,sculptures:Object.fromEntries([...this.sculptureDisplays].map(([id,d])=>[id,d.state])),pointerLocked:this.mouseControls.locked,pointerLockError:this.pointerLockError,mousePaused:this.mouseControls.paused,stick:this.stick,loadedTextures:this.hung.reduce((n,h)=>n+h.textures.size,0),render:{calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,pictureLights:this.lightPool.lights.length,visibleRooms:[...this.activeRooms],pixelRatio:this.renderer.getPixelRatio()}};}
 private clearInput(){this.keys.clear();this.stick={x:0,y:0};this.drag=null;this.mousePosition=null;this.touches.clear();this.floorMarker.hide();this.setHover(null,true);this.container.classList.toggle('is-aiming',false);}
 enter(){this.mouseControls.lock();}
 resume(){if(!this.suspended)this.mouseControls.resume();}
 suspend(value:boolean){this.renderDirty=true;this.suspended=value;this.clearInput();this.mouseControls.suspend(value);if(value&&(this.flight||this.floorWalk))this.cancel();}
 setStick(x:number,y:number){this.stick={x,y};if(x||y)this.cancel();}
 reset(){this.goToRoom((roomAt(this.camera.position)??[...rooms].sort((a,b)=>Math.hypot(a.x-this.camera.position.x,a.z-this.camera.position.z)-Math.hypot(b.x-this.camera.position.x,b.z-this.camera.position.z))[0]).id);}
 goToRoom(id:string){
  this.cancel();this.clearInput();const r=roomFor(id);this.camera.position.set(r.x,theme.initial.y,r.z);
  const featured=this.hung.find(h=>h.a.id===r.entryArtwork),exhibit=sculptures.find(s=>s.room===id);
  if(exhibit){this.camera.position.x+=r.width*.22;this.camera.position.z+=r.depth*.22;}
  if(id==='leonardo')this.camera.position.z+=r.depth*.25;
  const pedestal=sculpturePositions[id as keyof typeof sculpturePositions];
  const target=featured?.center??(exhibit&&pedestal?new THREE.Vector3(pedestal.x,(sculpturePedestalHeight+exhibit.height)/2,pedestal.z):null);
  this.yaw=target?Math.atan2(this.camera.position.x-target.x,this.camera.position.z-target.z):0;
  this.pitch=target?Math.atan2(target.y-this.camera.position.y,Math.hypot(target.x-this.camera.position.x,target.z-this.camera.position.z)):0;
  this.selected=null;this.renderDirty=true;this.onRoam();this.onStatus(`${r.name} · ${sculptures.some(s=>s.room===id)?'点击雕塑，旋转细看':'点击画作，驻足审视'}`);
  if(exhibit)void this.ensureSculpture(exhibit).catch(()=>{});
 }
 async preview(id:string){
  const r=roomFor(id),exhibit=sculptures.find(s=>s.room===id);if(exhibit)await this.ensureSculpture(exhibit);
  await Promise.all(this.hung.filter(h=>(h.a.room??'rembrandt')===id).map(h=>this.previewTexture(h)));
  const camera=new THREE.PerspectiveCamera(58,16/10,.05,100);camera.position.set(r.x+r.width*.21,exhibit?3.4:2.9,r.z+r.depth*.34);camera.lookAt(r.x-1.2,2.6,r.z-r.depth*.22);camera.updateMatrixWorld();
  const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)),visible=visibleRooms(camera.position,frustum);
  await Promise.all(sculptures.filter(s=>s.room!==id&&visible.has(s.room)).map(s=>this.ensureSculpture(s).catch(()=>{})));
  const ratio=this.renderer.getPixelRatio(),size=this.renderer.getSize(new THREE.Vector2());
  const visibility=[...this.roomRoots.values(),...this.hung.map(h=>h.group),...[...this.sculptureDisplays.values()].map(d=>d.root)].map(object=>({object,visible:object.visible}));
  try{
   for(const [key,root]of this.roomRoots)root.visible=visible.has(key);for(const h of this.hung)h.group.visible=visible.has(h.a.room??'rembrandt');for(const s of sculptures)this.sculptureDisplays.get(s.id)!.root.visible=visible.has(s.room);
   this.floorMarker.hide();this.destinationMarker.hide();this.hoverHighlight.visible=false;
   this.renderer.setPixelRatio(1);this.renderer.setSize(960,600,false);this.renderer.render(this.scene,camera);
   return this.renderer.domElement.toDataURL('image/webp',.86);
  }finally{this.renderer.setPixelRatio(ratio);this.renderer.setSize(size.x,size.y,false);for(const {object,visible}of visibility)object.visible=visible;this.renderDirty=true;}
 }
 private previewTexture(h:Hung){if((h.mesh.material as THREE.MeshBasicMaterial).map)return Promise.resolve();return new Promise<void>(resolve=>{new THREE.TextureLoader().load(h.a.variants[0].url!,texture=>{if(h.textures.size){texture.dispose();resolve();return;}texture.colorSpace=THREE.SRGBColorSpace;h.textures.set(0,texture);h.lod=0;const material=h.mesh.material as THREE.MeshBasicMaterial;material.map=texture;material.needsUpdate=true;resolve();},undefined,()=>resolve());});}
 private box(w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number,parent:THREE.Object3D=this.scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;}
 private room(r:typeof rooms[number]){
  const {width:w,depth:d,height:h,wall:color}=r;
  const root=new THREE.Group();root.position.set(r.x,0,r.z);this.scene.add(root);this.roomRoots.set(r.id,root);
  const pieces:THREE.Mesh<THREE.BoxGeometry,THREE.Material>[]=[];
  const box=(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number)=>{const mesh=this.box(w,h,d,m,x,y,z,root);pieces.push(mesh);return mesh;};
  const solid=(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number)=>{const mesh=box(w,h,d,m,x,y,z);this.floorBlockers.push(mesh);return mesh;};
  const wall=new THREE.MeshStandardMaterial({color,roughness:.9});const trim=new THREE.MeshStandardMaterial({color:0xa58b55,metalness:.45,roughness:.55});const dark=new THREE.MeshStandardMaterial({color:0x152e25});
  const doors=doorsFor(r.id);
  const sides=[{side:'north',axis:'z',sign:-1,span:w,edge:d/2},{side:'south',axis:'z',sign:1,span:w,edge:d/2},{side:'west',axis:'x',sign:-1,span:d,edge:w/2},{side:'east',axis:'x',sign:1,span:d,edge:w/2}];
  const wallBox=(s:typeof sides[number],span:number,height:number,thickness:number,material:THREE.Material,along:number,y:number,inset:number,blocker=false)=>{
   const across=s.sign*(s.edge+inset);
   return s.axis==='x'?(blocker?solid:box)(thickness,height,span,material,across,y,along):(blocker?solid:box)(span,height,thickness,material,along,y,across);
  };
  for(const s of sides){
   const door=doors.find(door=>door.side===s.side);
   if(!door){wallBox(s,s.span,h,.2,wall,0,h/2,.1,true);continue;}
   const p=door.passage,opening=s.axis==='x'?p.z-r.z:p.x-r.x,half=p.width/2,t=p.length/2;
   for(const [lo,hi]of [[-s.span/2,opening-half],[opening+half,s.span/2]])wallBox(s,hi-lo,h,t,wall,(lo+hi)/2,h/2,t/2,true);
   wallBox(s,p.width,h-p.height,t,wall,opening,(h+p.height)/2,t/2,true);
  }
  // Parquet is a small repeat texture generated locally, never a network image.
  const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d')!;ctx.fillStyle='#63503a';ctx.fillRect(0,0,512,512);
  let seed=71;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let row=0;row<8;row++)for(let col=0;col<4;col++){const x=col*128+(row%2)*64;const y=row*64;const v=Math.floor(random()*20);ctx.fillStyle=`rgb(${103+v},${82+v},${58+v})`;ctx.fillRect(x,y,126,62);for(let k=0;k<15;k++){ctx.strokeStyle=`rgba(36,24,11,${random()*.12})`;ctx.beginPath();ctx.moveTo(x,y+random()*62);ctx.lineTo(x+126,y+random()*62);ctx.stroke();}}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(w/2,d/2);
  const floor=new THREE.MeshStandardMaterial({map:tex,roughness:.7});box(w,.16,d,floor,0,-.08,0);
  const ceiling=new THREE.MeshStandardMaterial({color:0xd8cfbc,roughness:.85});box(w,.15,d,ceiling,0,h+.07,0);
  for(const y of [.18,1.02,h-.45,h-.2])for(const s of sides){
   const thickness=y>5?.12:.035,m=y===.18?dark:trim,p=doors.find(door=>door.side===s.side)?.passage;
   const opening=p?(s.axis==='x'?p.z-r.z:p.x-r.x):0;
   const spans=p&&y<p.height?[[-s.span/2,opening-p.width/2],[opening+p.width/2,s.span/2]]:[[-s.span/2,s.span/2]];
   for(const [lo,hi]of spans)wallBox(s,hi-lo,thickness,.09,m,(lo+hi)/2,y,-.045);
  }
  for(let x=-w/2+2;x<w/2;x+=4)box(.1,.12,d,ceiling,x,h-.06,0);
  for(let z=-d/2+2;z<d/2;z+=4)box(w,.12,.1,ceiling,0,h-.06,z);
  if(r===rooms[0]){this.scene.add(new THREE.HemisphereLight(0xffefd2,0x676048,theme.lighting.ambient));const light=new THREE.DirectionalLight(0xffe4b5,theme.lighting.key);light.position.set(0,h-1,2);this.scene.add(light);}
  // Slim ceiling tracks keep every wall's picture lights aligned.
  const track=new THREE.MeshStandardMaterial({color:0x242821,metalness:.55,roughness:.5});
  const railY=h-theme.lighting.ceilingGap,railInset=theme.lighting.railInset;
  for(const sign of [-1,1]){
   box(w-.7,.055,.08,track,0,railY,sign*(d/2-railInset));
   box(.08,.055,d-.7,track,sign*(w/2-railInset),railY,0);
  }
  // Warm ceiling luminaires, restrained geometry.
  const luminous=new THREE.MeshBasicMaterial({color:0xffe5ac});
  for(const z of [-d*.28,d*.23]){box(2.6,.04,.5,luminous,0,h-.3,z);box(2.7,.08,.6,trim,0,h-.23,z);}
  if(!sculptures.some(s=>s.room===r.id)){
  const seat=benchPosition(r),bench=createGalleryBench(this.renderer.capabilities.getMaxAnisotropy());bench.position.set(seat.x-r.x,0,seat.z-r.z);root.add(bench);
  // A picking proxy prevents a floor marker shining through the seat or selecting beneath it.
  const benchBlocker=new THREE.Mesh(new THREE.BoxGeometry(3.52,.62,.94));benchBlocker.position.set(seat.x,.31,seat.z);benchBlocker.updateMatrixWorld();this.floorBlockers.push(benchBlocker);
  }
  // Both sides of the opening are visibly framed; no panel or trim crosses the clear doorway.
  for(const door of doors){const p=door.passage,s=sides.find(s=>s.side===door.side)!,opening=s.axis==='x'?p.z-r.z:p.x-r.x,half=p.width/2;
  for(const along of [opening-half-.11,opening+half+.11]){wallBox(s,.2,p.height+.12,.18,trim,along,(p.height+.12)/2,-.07);wallBox(s,.28,.2,.25,trim,along,.1,-.07);}
  wallBox(s,p.width+.44,.18,.22,trim,opening,p.height+.12,-.07);
  const next=roomFor(door.next);
  const sign=document.createElement('canvas');sign.width=1200;sign.height=240;const sc=sign.getContext('2d')!;
  sc.fillStyle='#f2dfb1';sc.textAlign='center';sc.font='600 76px "PingFang SC",sans-serif';sc.fillText(next.name,600,100,1120);sc.fillStyle='#d0bd92';sc.font='32px sans-serif';sc.fillText(next.subtitle??`${next.number} · ${next.artist}`,600,175);
  const signTexture=new THREE.CanvasTexture(sign);signTexture.colorSpace=THREE.SRGBColorSpace;
  const signMesh=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.56),new THREE.MeshBasicMaterial({map:signTexture,transparent:true,depthWrite:false}));
  signMesh.position.set(s.axis==='x'?s.sign*(s.edge-.015):opening,p.height+.55,s.axis==='z'?s.sign*(s.edge-.015):opening);
  signMesh.rotation.y=s.axis==='x'?-s.sign*Math.PI/2:s.sign===-1?0:Math.PI;root.add(signMesh);
  const guide=createDoorwayGuide(r,door,this.renderer.capabilities.getMaxAnisotropy());root.add(guide);this.targets.push(guide.getObjectByName('doorway-direction-arrow')!);
  }
  batchArchitecture(pieces,root,new Set(this.floorBlockers));
  // Bench intentionally has no collision collider: visitors can never become trapped.
 }
 private connectRooms(){
  for(const {x,z,length,width,height,axis}of passages){
  const wall=new THREE.MeshStandardMaterial({color:0x393c2e,roughness:.9}),stone=new THREE.MeshStandardMaterial({color:0x8b7c61,roughness:.8});
  this.box(axis==='x'?length:width,.16,axis==='x'?width:length,stone,x,-.08,z);this.box(axis==='x'?length:width,.16,axis==='x'?width:length,stone,x,height+.08,z);
  for(const side of [-1,1]){const mesh=this.box(axis==='x'?length:.2,height,axis==='x'?.2:length,wall,x+(axis==='z'?side*(width/2+.1):0),height/2,z+(axis==='x'?side*(width/2+.1):0));mesh.updateMatrixWorld();this.floorBlockers.push(mesh);}
  }
 }
 private sculpture(s:Sculpture){
  const {x,z,yaw}=sculpturePositions[s.room as keyof typeof sculpturePositions],root=new THREE.Group();root.position.set(x,0,z);root.rotation.y=yaw;this.scene.add(root);
  this.sculptureDisplays.set(s.id,{root,loading:null,state:'idle'});
  const pedestal=createSculpturePedestal(s,this.renderer.capabilities.getMaxAnisotropy());root.add(pedestal.root);this.targets.push(pedestal.label);
 }
 private ensureSculpture(s:Sculpture){
  const entry=this.sculptureDisplays.get(s.id)!;
  if(entry.loading)return entry.loading;entry.state='loading';
  entry.loading=loadSculpture(s.id).then(model=>{const display=model.clone(true);display.position.y=sculpturePedestalHeight;entry.root.add(display);
   // Bound proxies keep ray picking independent of the scan's triangle count.
   entry.root.updateWorldMatrix(true,true);const bounds=new THREE.Box3().setFromObject(display),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
   const proxy=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z));proxy.position.copy(center);proxy.visible=false;proxy.userData={id:s.id,kind:'sculpture'};this.scene.add(proxy);this.targets.push(proxy);
   entry.state='ready';this.renderDirty=true;}).catch(error=>{entry.state='error';entry.loading=null;this.onStatus('雕塑载入失败，通过「展厅」重新进入可重试。');console.error(error);throw error;});
  return entry.loading;
 }
 private hang(a:Artwork){
  const r=roomFor(a.room);
  const group=new THREE.Group();let center:THREE.Vector3;let rotation:number;
  if(a.wall==='north'){center=new THREE.Vector3(a.offset,a.centerY,-r.depth/2+.14);rotation=0;}else if(a.wall==='south'){center=new THREE.Vector3(-a.offset,a.centerY,r.depth/2-.14);rotation=Math.PI;}else if(a.wall==='east'){center=new THREE.Vector3(r.width/2-.14,a.centerY,a.offset);rotation=-Math.PI/2;}else{center=new THREE.Vector3(-r.width/2+.14,a.centerY,-a.offset);rotation=Math.PI/2;}center.x+=r.x;center.z+=r.z;
  const normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);group.position.copy(center);group.rotation.y=rotation;this.scene.add(group);
  const {height,width}=a;
  const frame=this.frames.create(width,height);group.add(frame.group);frame.hitMesh.userData={id:a.id,kind:'art'};this.targets.push(frame.hitMesh);
  const mat=new THREE.MeshBasicMaterial({color:0xffffff});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);mesh.position.z=.085;mesh.userData={id:a.id,kind:'art'};group.add(mesh);this.targets.push(mesh);
  const label=createArtworkLabel(a,this.renderer.capabilities.getMaxAnisotropy());
  // Keep the card above the 1.02 m dado rail so the wall moulding cannot obscure its face.
  const labelBottom=Math.max(a.centerY-height/2-frame.border+.04,1.12);
  label.group.position.set(width/2+frame.border+.24+label.width/2,labelBottom-a.centerY+label.height/2,-.129);
  group.add(label.group);this.targets.push(label.hitMesh);
  const sphere=new THREE.Sphere(center,Math.hypot(width,height)/2+frame.border);
  const hung: Hung={a,group,center,normal,width,frameBorder:frame.border,mesh,detail:frame.detail,sphere,lod:-1,textures:new Map()};this.hung.push(hung);this.loadLOD(hung,0);
  this.pictureLight(group,width,height,a.centerY,r.id,center,normal,sphere);
 }
 private pictureLight(parent:THREE.Group,width:number,height:number,centerY:number,room:string,center:THREE.Vector3,normal:THREE.Vector3,sphere:THREE.Sphere){
  const {railInset,ceilingGap}=theme.lighting;
  const railY=roomFor(room).height-ceilingGap-centerY;
  const z=railInset-.14;
  const metal=new THREE.MeshStandardMaterial({color:0x292c25,metalness:.65,roughness:.42});
  this.box(.16,.06,.18,metal,0,railY,z,parent);
  this.box(.055,.19,.055,metal,0,railY-.12,z,parent);
  const head=new THREE.Group();head.position.set(0,railY-.25,z);parent.add(head);
  const aim=new THREE.Vector3(0,height*.08,.09);
  const direction=aim.clone().sub(head.position).normalize();
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.115,.095,.27,16),metal);
  barrel.rotation.x=Math.PI/2;head.add(barrel);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.087,20),new THREE.MeshBasicMaterial({color:0xffe5b6}));
  lens.position.z=.138;head.add(lens);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.099,.012,6,20),new THREE.MeshStandardMaterial({color:0x9a8252,metalness:.6,roughness:.4}));
  rim.position.z=.14;head.add(rim);
  const distance=head.position.distanceTo(aim);
  const angle=THREE.MathUtils.clamp(Math.atan2(Math.hypot(width,height)*.58,distance),.33,.69);
  this.pictureLights.push({room,center,normal,sphere,angle,position:parent.localToWorld(head.position.clone().addScaledVector(direction,.17)),target:parent.localToWorld(aim.clone())});
 }
 private updateVisibility(dt:number){
  this.camera.updateMatrixWorld();this.viewProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse);this.frustum.setFromProjectionMatrix(this.viewProjection);
  const visible=visibleRooms(this.camera.position,this.frustum);
  const changed=rooms.some(r=>visible.has(r.id)!==this.activeRooms.has(r.id));this.activeRooms=visible;
  for(const [id,root]of this.roomRoots)root.visible=visible.has(id);
  for(const s of sculptures){const entry=this.sculptureDisplays.get(s.id)!;entry.root.visible=visible.has(s.room);if(entry.root.visible&&entry.state==='idle')void this.ensureSculpture(s).catch(()=>{});}
  for(const h of this.hung){h.group.visible=visible.has(h.a.room??'rembrandt');if(!h.group.visible)continue;
   const distance=Math.max(.1,this.camera.position.distanceTo(h.center)),pixels=h.a.height/distance*this.container.clientHeight/(2*Math.tan(this.camera.fov*Math.PI/360));
   h.detail.visible=pixels>(h.detail.visible?130:160);
  }
  this.lightingClock+=dt;if(changed||this.lightingClock>.1){this.lightingClock=0;this.lightPool.update(this.pictureLights,this.camera,this.frustum,visible,theme.lighting.spotIntensity);}
 }
 private loadLOD(h:Hung,level:number){if(h.lod===level)return;h.lod=level;const existing=h.textures.get(level);if(existing){(h.mesh.material as THREE.MeshBasicMaterial).map=existing;(h.mesh.material as THREE.MeshBasicMaterial).needsUpdate=true;this.renderDirty=true;return;}
  new THREE.TextureLoader().load(h.a.variants[level].url!,texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());if(h.lod!==level){texture.dispose();return;}h.textures.set(level,texture);if(h.lod===level){const m=h.mesh.material as THREE.MeshBasicMaterial;m.map=texture;m.needsUpdate=true;this.renderDirty=true;for(const [oldLevel,oldTexture]of h.textures){if(oldLevel!==level){oldTexture.dispose();h.textures.delete(oldLevel);}}}},undefined,()=>{h.lod=-1;this.onStatus(`${h.a.title}展示图载入失败，请刷新重试`);});
 }
 private focusPose(h:Hung){
  const uiAllowance=this.container.clientHeight<=520?1.4:this.container.clientWidth<=700&&this.camera.aspect>=1?1.3:1;
  const distance=fitDistance(h.width+2*h.frameBorder,h.a.height+2*h.frameBorder,this.camera.aspect,this.camera.fov)*uiAllowance;
  const position=h.center.clone().addScaledVector(h.normal,distance);position.y=theme.initial.y;this.bound(position,h.a.room??'rembrandt');
  const pitch=Math.atan2(h.center.y-position.y,Math.hypot(position.x-h.center.x,position.z-h.center.z));
  return {position,yaw:Math.atan2(h.normal.x,h.normal.z),pitch};
 }
 focus(id:string){const h=this.hung.find(x=>x.a.id===id);if(!h)return;const pose=this.focusPose(h),route=planWalk(this.camera.position,pose.position);if(!route.length)return;this.floorWalk=null;this.destinationMarker.hide();this.selected=id;this.manual=false;this.keys.clear();this.stick={x:0,y:0};const duration=moveDuration(this.routeLength(this.camera.position,route),'artwork');this.flight={start:this.camera.position.clone(),end:pose.position,fromYaw:this.yaw,toYaw:shortestAngle(this.yaw,pose.yaw),fromPitch:this.pitch,toPitch:pose.pitch,startTime:performance.now(),id,route,duration};this.onSelect(h.a,false,true);this.onStatus(`走向《${h.a.title}》 · 拖动或移动可取消`);}
 private cancel(){this.flight=null;this.floorWalk=null;this.destinationMarker.hide();if(!this.manual&&this.selected){const h=this.hung.find(h=>h.a.id===this.selected);if(h)this.onSelect(h.a,false,false);}this.manual=true;}
 private turnView(dx:number,dy:number,touch=false){
  if(touch){
   if(this.flight||this.floorWalk)this.cancel();
   this.yaw+=dx*.004;this.pitch=clamp(this.pitch+dy*.003,-.8,.8);
   if(this.manual||!this.selected)this.onStatus('自由漫游 · 点击画作，驻足审视');
  }else{
   if(this.flight)return;
   const look=mouseLook(this.yaw,this.pitch,dx,dy);this.yaw=look.yaw;this.pitch=look.pitch;
  }
 }
 private bound(p:THREE.Vector3,roomId?:string){const floor=projectToFloor(p,roomId);p.x=floor.x;p.z=floor.z;}
 private routeLength(start:{x:number;z:number},route:{x:number;z:number}[]){let length=0,last=start;for(const p of route){length+=Math.hypot(p.x-last.x,p.z-last.z);last=p;}return length;}
 private floorTarget(){
  if(this.ray.ray.direction.y>=-.015)return null;
  const point=this.ray.ray.intersectPlane(this.floorPlane,new THREE.Vector3());if(!point)return null;
  if(!isWalkable(point))return null;
  if(Math.hypot(point.x-this.camera.position.x,point.z-this.camera.position.z)<.45)return null;
  if(rooms.some(r=>{const seat=benchPosition(r);return !sculptures.some(s=>s.room===r.id)&&Math.abs(point.x-seat.x)<1.82&&Math.abs(point.z-seat.z)<.55;}))return null;
  return point;
 }
 private walkTo(point:THREE.Vector3,roomId?:string){
  const route=planWalk(this.camera.position,point);if(!route.length)return;
  this.cancel();this.selected=null;this.onRoam();this.keys.clear();this.stick={x:0,y:0};
  const end=new THREE.Vector3(point.x,this.camera.position.y,point.z);
  this.floorWalk={roomId,start:this.camera.position.clone(),end,route,startTime:performance.now(),duration:moveDuration(this.routeLength(this.camera.position,route),'floor')};
  this.destinationMarker.show(point);this.floorMarker.hide();this.onStatus(roomId?`前往${roomFor(roomId).name} · 按方向键或 Esc 停止`:'走向光圈 · 可环顾，按方向键或 Esc 停止');
 }
 private updateFloorWalk(now:number){
  const walk=this.floorWalk;if(!walk)return;
  const t=clamp((now-walk.startTime)/walk.duration,0,1),ease=t*t*(3-2*t);
  const point=positionOnRoute(walk.start,walk.route,ease);this.camera.position.set(point.x,walk.start.y,point.z);
  if(t===1){this.floorWalk=null;this.destinationMarker.hide();this.onStatus(walk.roomId?`已到达${roomFor(walk.roomId).name}中央`:'已到达 · 看向地板可继续选择位置');}
 }
 private setHover(hit:THREE.Object3D|null,immediate=false){
  const doorway=hit?.userData.kind==='doorway'?hit as DoorwayTarget:null;
  if(doorway!==this.hoveredDoorway){
   if(this.hoveredDoorway)this.hoveredDoorway.setHovered(false);
   if(doorway)doorway.setHovered(true);
   this.hoveredDoorway=doorway;this.renderDirty=true;
  }
  this.container.classList.toggle('is-hovering-doorway',!!doorway);
  const h=hit?this.hung.find(h=>h.a.id===hit.userData.id):undefined;
  const label=!!hit&&(hit.userData.kind==='sculpture-label'||!!h&&hit.userData.kind==='label');
  this.container.classList.toggle('is-hovering-artwork',!!h&&!label);
  this.container.classList.toggle('is-hovering-label',label);
  if(label){const geometry=(hit as THREE.Mesh<THREE.PlaneGeometry>).geometry;this.hoverHighlight.show(hit!,geometry.parameters.width,geometry.parameters.height,.009);}
  else if(h)this.hoverHighlight.show(h.group,h.width+h.frameBorder*2,h.a.height+h.frameBorder*2,.07+h.frameBorder);
  else this.hoverHighlight.dismiss(immediate);
 }
 private pick(x:number,y:number,click:boolean,center=false){
  if(this.suspended||this.mouseControls.paused){this.floorMarker.hide();this.setHover(null,true);return;}
  const r=this.renderer.domElement.getBoundingClientRect();if(center)this.pointer.set(0,0);else this.pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.camera.updateMatrixWorld();this.ray.setFromCamera(this.pointer,this.camera);
  // The return arrow belongs to visitors approaching from the other room.
  const currentRoom=roomAt(this.camera.position)?.id;
  const targets=this.targets.filter(target=>target.userData.kind!=='doorway'||target.userData.from===currentRoom);
  const hit=this.ray.intersectObjects([...targets,...this.floorBlockers])[0];
  const floor=this.floorTarget();
  const isFloor=!!floor&&(!hit||this.camera.position.distanceTo(floor)<hit.distance);
  const isDoorway=!!hit&&hit.object.userData.kind==='doorway'&&!isFloor;
  const isArtwork=!!hit&&!!hit.object.userData.id&&!isFloor;
  this.setHover(isArtwork||isDoorway?hit.object:null);
  this.container.classList.toggle('is-aiming',isFloor||isArtwork||isDoorway);
  if(isDoorway){
   this.floorMarker.hide();
   if(click){const next=roomFor(hit.object.userData.to);this.walkTo(new THREE.Vector3(next.x,0,next.z),next.id);}
   return;
  }
  if(isFloor){
   if(!this.floorWalk||floor.distanceTo(new THREE.Vector3(this.floorWalk.end.x,0,this.floorWalk.end.z))>.45)this.floorMarker.show(floor);else this.floorMarker.hide();
   if(click)this.walkTo(floor);return;
  }
  this.floorMarker.hide();if(!isArtwork)return;
  if(hit.object.userData.kind==='sculpture'){if(click)this.onSculpture(hit.object.userData.id);return;}
  if(hit.object.userData.kind==='sculpture-label'){if(click)this.onSculptureInfo(sculptures.find(s=>s.id===hit.object.userData.id)!);return;}
  const h=this.hung.find(h=>h.a.id===hit.object.userData.id)!;if(!click)return;
  if(hit.object.userData.kind==='label'){this.onInfo(h.a);return;}
  const pose=this.focusPose(h);
  if(canOpen(this.selected,h.a.id,!!this.flight||this.manual,this.camera.position.distanceTo(pose.position)))this.onOpen(h.a);else this.focus(h.a.id);
 }
 private updateHover(){
  if(this.mouseControls.locked)this.pick(0,0,false,true);
  else if(this.mouseControls.dragMode&&this.mousePosition&&!this.drag&&!this.mouseControls.paused)this.pick(this.mousePosition.x,this.mousePosition.y,false);
  else{this.floorMarker.hide();this.setHover(null);}
 }
 private bind(){const c=this.renderer.domElement;const signal=this.abort.signal;
  // Mouse look/clicks are handled by pointer lock; touch keeps its independent drag and tap controls.
  c.addEventListener('pointerdown',e=>{if((e.pointerType==='mouse'&&!this.mouseControls.dragMode)||this.suspended)return;this.mousePosition=e.pointerType==='mouse'?{x:e.clientX,y:e.clientY}:null;this.touches.add(e.pointerId);if(this.touches.size>1){this.drag=null;return;}if(e.button!==0)return;c.setPointerCapture(e.pointerId);this.pick(e.clientX,e.clientY,false);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,max:0};},{signal});
  c.addEventListener('pointermove',e=>{if((e.pointerType==='mouse'&&!this.mouseControls.dragMode)||this.suspended)return;if(e.pointerType==='mouse')this.mousePosition={x:e.clientX,y:e.clientY};const d=this.drag;if(!d||d.id!==e.pointerId)return;d.max=Math.max(d.max,Math.hypot(e.clientX-d.x,e.clientY-d.y));if(d.max>6)this.turnView(e.clientX-d.lastX,e.clientY-d.lastY,true);d.lastX=e.clientX;d.lastY=e.clientY;},{signal});
  c.addEventListener('pointerleave',()=>{this.mousePosition=null;this.floorMarker.hide();this.setHover(null,true);},{signal});
  const end=(e:PointerEvent)=>{if(e.pointerType==='mouse'&&!this.mouseControls.dragMode)return;const d=this.drag;this.touches.delete(e.pointerId);if(d?.id===e.pointerId){this.drag=null;if(e.type==='pointerup'&&d.max<=6&&!this.suspended)this.pick(e.clientX,e.clientY,true);this.setHover(null);}};
  c.addEventListener('pointerup',end,{signal});c.addEventListener('pointercancel',end,{signal});c.addEventListener('lostpointercapture',()=>{this.drag=null;},{signal});
  window.addEventListener('keydown',e=>{if(this.suspended||this.mouseControls.paused||/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test((e.target as HTMLElement).tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);this.cancel();}if(e.code==='Escape'&&(this.flight||this.floorWalk))this.cancel();},{signal});
  window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal});window.addEventListener('blur',()=>{this.clearInput();if(this.flight||this.floorWalk)this.cancel();},{signal});
  document.addEventListener('visibilitychange',()=>{this.renderDirty=true;if(document.hidden){this.clearInput();if(this.flight||this.floorWalk)this.cancel();}},{signal});
  c.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onStatus('展厅图形上下文暂时丢失，正在等待恢复…');},{signal});c.addEventListener('webglcontextrestored',()=>{this.renderDirty=true;this.onStatus('展厅已恢复');},{signal});
 }
 private resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderDirty=true;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.selected&&!this.manual&&!this.suspended)this.focus(this.selected);}
 private frame(){const dt=Math.min(this.clock.getDelta(),.04);
 if(this.suspended||document.hidden)return;
 if(this.mouseControls.paused&&!this.renderDirty&&this.lastRenderPosition.equals(this.camera.position)&&this.lastRenderYaw===this.yaw&&this.lastRenderPitch===this.pitch)return;
 if(!this.mouseControls.paused){
  this.updateFloorWalk(performance.now());
  if(this.flight){const f=this.flight;const t=clamp((performance.now()-f.startTime)/f.duration,0,1);const ease=t*t*(3-2*t);const point=positionOnRoute(f.start,f.route,ease);this.camera.position.set(point.x,THREE.MathUtils.lerp(f.start.y,f.end.y,ease),point.z);this.yaw=THREE.MathUtils.lerp(f.fromYaw,f.toYaw,ease);this.pitch=THREE.MathUtils.lerp(f.fromPitch,f.toPitch,ease);if(t===1){this.flight=null;this.manual=false;const h=this.hung.find(h=>h.a.id===f.id)!;this.onSelect(h.a,true,false);this.onStatus(`驻足审视 · 再点画面进入高清 / 点击展签读介绍`);}}
  let forward=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-this.stick.y;
  let side=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.stick.x;
  const length=Math.hypot(forward,side);if(length){if(length>1){forward/=length;side/=length;}const s=dt*2.65,p=this.camera.position;const next=moveOnFloor(p,{x:p.x+(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*s,z:p.z+(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*s});p.x=next.x;p.z=next.z;this.manual=true;this.onStatus('自由漫游 · 点击画作，驻足审视');}
 }
 this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.updateVisibility(dt);this.lodClock+=dt;if(this.lodClock>.7){this.lodClock=0;for(const h of this.hung){if(!h.group.visible)continue;const distance=this.camera.position.distanceTo(h.center);const projectedPixels=h.a.height/distance*this.container.clientHeight/(2*Math.tan(this.camera.fov*Math.PI/360))*this.renderer.getPixelRatio();this.loadLOD(h,projectedPixels>1450?2:projectedPixels>500?1:0);}}
 this.updateHover();const now=performance.now();this.floorMarker.animate(now);this.destinationMarker.animate(now);this.hoverHighlight.animate(dt,now);this.renderer.render(this.scene,this.camera);
 this.renderDirty=false;this.lastRenderPosition.copy(this.camera.position);this.lastRenderYaw=this.yaw;this.lastRenderPitch=this.pitch;
 }
}
