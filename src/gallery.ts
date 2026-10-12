import * as THREE from 'three';
import { theme } from './data/theme';
import { fitDistance, shortestAngle, clamp, canOpen, mouseLook } from './navigation.mjs';
import type { Artwork } from './types';
import {OrnateFrames} from './ornate-frame';
import {createGalleryBench} from './bench';
import {createArtworkLabel} from './artwork-label';
import {FloorMarker} from './floor-marker';
import {HoverHighlight} from './hover-highlight';
import {installPointerLook} from './pointer-look.mjs';
import {rooms,passage,roomFor,roomAt,isWalkable,projectToFloor,moveOnFloor,planWalk,positionOnRoute} from './museum-layout.mjs';
import {batchArchitecture,visibleRooms,PictureLightPool,type PictureLight} from './render-budget';
interface Hung {a:Artwork; group:THREE.Group; center:THREE.Vector3; normal:THREE.Vector3; width:number; frameBorder:number; mesh:THREE.Mesh; detail:THREE.Group; sphere:THREE.Sphere;lod:number; textures:Map<number,THREE.Texture>}
interface Flight {start:THREE.Vector3;end:THREE.Vector3;fromYaw:number;toYaw:number;fromPitch:number;startTime:number;id:string;route:{x:number;z:number}[];duration:number}
interface FloorWalk {start:THREE.Vector3;end:THREE.Vector3;startTime:number;duration:number;route:{x:number;z:number}[]}
export class Gallery {
 readonly renderer: THREE.WebGLRenderer;
 readonly camera=new THREE.PerspectiveCamera(52,1,.05,80);
 private scene=new THREE.Scene();private hung: Hung[]=[];private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();
 private targets:THREE.Object3D[]=[];private clock=new THREE.Clock();private yaw=0;private pitch=0;
 private keys=new Set<string>();private stick={x:0,y:0};private flight:Flight|null=null;private selected:string|null=null;
 private drag:{id:number;x:number;y:number;lastX:number;lastY:number;max:number}|null=null;
 private touches=new Set<number>();private suspended=false;private lodClock=0;private manual=false;
 private mouseControls:ReturnType<typeof installPointerLook>;
 private pointerLockError:string|null=null;
 private abort=new AbortController();private observer:ResizeObserver;
 private frames:OrnateFrames;
 private floorPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 private floorBlockers:THREE.Object3D[]=[];
 private floorMarker=new FloorMarker();private destinationMarker=new FloorMarker(true);
 private hoverHighlight=new HoverHighlight(matchMedia('(prefers-reduced-motion: reduce)').matches);
 private floorWalk:FloorWalk|null=null;
 private roomRoots=new Map<string,THREE.Group>();private viewProjection=new THREE.Matrix4();private frustum=new THREE.Frustum();
 private pictureLights:PictureLight[]=[];private lightPool:PictureLightPool;
 private activeRooms=new Set<string>();private lightingClock=1;
 private renderDirty=true;private lastRenderPosition=new THREE.Vector3(Infinity,Infinity,Infinity);private lastRenderYaw=NaN;private lastRenderPitch=NaN;
 constructor(private container:HTMLElement, artworks:Artwork[], private onSelect:(a:Artwork,arrived:boolean,moving:boolean)=>void,private onOpen:(a:Artwork)=>void,private onInfo:(a:Artwork)=>void,private onStatus:(text:string)=>void,private onMouseMode:(locked:boolean,enabled:boolean)=>void,private onRoam:()=>void=()=>{}){
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  this.frames=new OrnateFrames(theme.frame,this.renderer.capabilities.getMaxAnisotropy());
  this.lightPool=new PictureLightPool(this.scene);
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setClearColor(0x18392e);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
  container.append(this.renderer.domElement);this.renderer.domElement.tabIndex=0;this.renderer.domElement.setAttribute('aria-label','3D展厅，点击进入后隐藏鼠标，上下左右移动鼠标转向，中心瞄准地板出现光圈，点击光圈走过去；点击画作驻足，点击展签读介绍，Esc显示鼠标并暂停漫游');
  this.camera.position.set(theme.initial.x,theme.initial.y,theme.initial.z);this.camera.rotation.order='YXZ';this.yaw=theme.initial.yaw;
  this.mouseControls=installPointerLook(this.renderer.domElement,{
   onMove:(dx:number,dy:number)=>this.turnView(dx,dy),
   onClick:()=>this.pick(0,0,true,true),
   onChange:(locked:boolean,enabled:boolean)=>{this.renderDirty=true;this.clearInput();if(locked){this.pointerLockError=null;this.renderer.domElement.focus({preventScroll:true});}if(!locked&&enabled&&(this.flight||this.floorWalk))this.cancel();this.onMouseMode(locked,enabled);},
   onError:(error:unknown)=>{if(error instanceof Error)this.pointerLockError=`${error.name}: ${error.message} (canvas connected: ${this.renderer.domElement.isConnected})`;else this.pointerLockError??='浏览器拒绝鼠标锁定';this.onStatus('鼠标锁定未成功，请点击展厅重试。');},
  },matchMedia('(pointer:fine)').matches);
  rooms.forEach(r=>this.room(r));this.connectRooms();this.scene.add(this.floorMarker,this.destinationMarker,this.hoverHighlight);artworks.forEach(a=>this.hang(a));this.bind();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.renderer.setAnimationLoop(()=>this.frame());
 }
 get state(){return {room:roomAt(this.camera.position)?.id??'passage',position:this.camera.position.toArray(),yaw:this.yaw,pitch:this.pitch,selected:this.selected,moving:!!(this.flight||this.floorWalk),floorDestination:this.floorWalk?.end.toArray()??null,suspended:this.suspended,pointerLocked:this.mouseControls.locked,pointerLockError:this.pointerLockError,mousePaused:this.mouseControls.paused,stick:this.stick,loadedTextures:this.hung.reduce((n,h)=>n+h.textures.size,0),render:{calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,pictureLights:this.lightPool.lights.length,visibleRooms:[...this.activeRooms],pixelRatio:this.renderer.getPixelRatio()}};}
 private clearInput(){this.keys.clear();this.stick={x:0,y:0};this.drag=null;this.touches.clear();this.floorMarker.hide();this.setHover(null,true);this.container.classList.toggle('is-aiming',false);}
 enter(){this.mouseControls.lock();}
 resume(){if(!this.suspended)this.mouseControls.resume();}
 suspend(value:boolean){this.renderDirty=true;this.suspended=value;this.clearInput();this.mouseControls.suspend(value);if(value&&(this.flight||this.floorWalk))this.cancel();}
 setStick(x:number,y:number){this.stick={x,y};if(x||y)this.cancel();}
 reset(){this.cancel();const r=roomAt(this.camera.position)??roomFor(this.camera.position.x<passage.x?'market':'rembrandt');this.camera.position.set(r.x,theme.initial.y,r.z+Math.min(theme.initial.z,r.depth/2-r.margin-.5));this.yaw=theme.initial.yaw;this.pitch=0;this.selected=null;this.onStatus('自由漫游 · 点击画作，驻足审视');}
 private box(w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number,parent:THREE.Object3D=this.scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;}
 private room(r:typeof rooms[number]){
  const {width:w,depth:d,height:h,wall:color}=r;
  const root=new THREE.Group();root.position.set(r.x,0,r.z);this.scene.add(root);this.roomRoots.set(r.id,root);
  const pieces:THREE.Mesh<THREE.BoxGeometry,THREE.Material>[]=[];
  const box=(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number)=>{const mesh=this.box(w,h,d,m,x,y,z,root);pieces.push(mesh);return mesh;};
  const solid=(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number)=>{const mesh=box(w,h,d,m,x,y,z);this.floorBlockers.push(mesh);return mesh;};
  const wall=new THREE.MeshStandardMaterial({color,roughness:.9});const trim=new THREE.MeshStandardMaterial({color:0xa58b55,metalness:.45,roughness:.55});const dark=new THREE.MeshStandardMaterial({color:0x152e25});
  solid(w,h,.2,wall,0,h/2,-d/2-.1);solid(w,h,.2,wall,0,h/2,d/2+.1);
  const opening=passage.z-r.z,half=passage.width/2,doorSide=r.door==='west'?-1:1;
  solid(.2,h,d,wall,-doorSide*(w/2+.1),h/2,0);
  // Each room supplies half of the shared wall, avoiding overlapping wall faces.
  const sharedThickness=passage.length/2;
  for(const [lo,hi] of [[-d/2,opening-half],[opening+half,d/2]])solid(sharedThickness,h,hi-lo,wall,doorSide*(w/2+sharedThickness/2),h/2,(lo+hi)/2);
  solid(sharedThickness,h-passage.height,passage.width,wall,doorSide*(w/2+sharedThickness/2),(h+passage.height)/2,opening);
  // Parquet is a small repeat texture generated locally, never a network image.
  const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d')!;ctx.fillStyle='#63503a';ctx.fillRect(0,0,512,512);
  let seed=71;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let row=0;row<8;row++)for(let col=0;col<4;col++){const x=col*128+(row%2)*64;const y=row*64;const v=Math.floor(random()*20);ctx.fillStyle=`rgb(${103+v},${82+v},${58+v})`;ctx.fillRect(x,y,126,62);for(let k=0;k<15;k++){ctx.strokeStyle=`rgba(36,24,11,${random()*.12})`;ctx.beginPath();ctx.moveTo(x,y+random()*62);ctx.lineTo(x+126,y+random()*62);ctx.stroke();}}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(w/2,d/2);
  const floor=new THREE.MeshStandardMaterial({map:tex,roughness:.7});box(w,.16,d,floor,0,-.08,0);
  const ceiling=new THREE.MeshStandardMaterial({color:0xc3b797,roughness:.85});box(w,.15,d,ceiling,0,h+.07,0);
  for(const y of [.18,1.02,5.55,5.8]){const thickness=y>5?.12:.035,m=y===.18?dark:trim;box(w,thickness,.09,m,0,y,-d/2+.045);box(w,thickness,.09,m,0,y,d/2-.045);box(.09,thickness,d,m,-doorSide*(w/2-.045),y,0);for(const [lo,hi] of (y<passage.height?[[-d/2,opening-half],[opening+half,d/2]]:[[-d/2,d/2]]))box(.09,thickness,hi-lo,m,doorSide*(w/2-.045),y,(lo+hi)/2);}
  for(let x=-w/2+2;x<w/2;x+=4)box(.1,.12,d,ceiling,x,5.94,0);
  for(let z=-d/2+2;z<d/2;z+=4)box(w,.12,.1,ceiling,0,5.94,z);
  if(r===rooms[0]){this.scene.add(new THREE.HemisphereLight(0xffefd2,0x676048,theme.lighting.ambient));const light=new THREE.DirectionalLight(0xffe4b5,theme.lighting.key);light.position.set(0,5,2);this.scene.add(light);}
  // Slim ceiling tracks keep every wall's picture lights aligned.
  const track=new THREE.MeshStandardMaterial({color:0x242821,metalness:.55,roughness:.5});
  const railY=h-theme.lighting.ceilingGap,railInset=theme.lighting.railInset;
  for(const sign of [-1,1]){
   box(w-.7,.055,.08,track,0,railY,sign*(d/2-railInset));
   box(.08,.055,d-.7,track,sign*(w/2-railInset),railY,0);
  }
  // Warm ceiling luminaires, restrained geometry.
  const luminous=new THREE.MeshBasicMaterial({color:0xffe5ac});
  for(const z of [-4,3]){box(2.6,.04,.5,luminous,0,5.7,z);box(2.7,.08,.6,trim,0,5.77,z);}
  const bench=createGalleryBench(this.renderer.capabilities.getMaxAnisotropy());bench.position.z=.7;root.add(bench);
  // A picking proxy prevents a floor marker shining through the seat or selecting beneath it.
  const benchBlocker=new THREE.Mesh(new THREE.BoxGeometry(3.52,.62,.94));benchBlocker.position.set(r.x,.31,r.z+.7);benchBlocker.updateMatrixWorld();this.floorBlockers.push(benchBlocker);
  // Both sides of the opening are visibly framed; no panel or trim crosses the clear doorway.
  const face=doorSide*(w/2-.07);
  for(const z of [opening-half-.11,opening+half+.11]){box(.18,passage.height+.12,.2,trim,face,(passage.height+.12)/2,z);box(.25,.2,.28,trim,face,.1,z);}
  box(.22,.18,passage.width+.44,trim,face,passage.height+.12,opening);
  const next=r.id==='rembrandt'?rooms[1]:rooms[0];
  const sign=document.createElement('canvas');sign.width=1200;sign.height=240;const sc=sign.getContext('2d')!;
  sc.fillStyle='#d8c291';sc.textAlign='center';sc.font='48px "Songti SC",serif';sc.fillText(`${next.number}  ·  ${next.name}`,600,92);sc.fillStyle='#c0ae8a';sc.font='25px sans-serif';sc.fillText(next.artist,600,155);
  const signTexture=new THREE.CanvasTexture(sign);signTexture.colorSpace=THREE.SRGBColorSpace;
  const signMesh=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.56),new THREE.MeshBasicMaterial({map:signTexture,transparent:true,depthWrite:false}));signMesh.position.set(doorSide*(w/2-.015),4.75,opening);signMesh.rotation.y=-doorSide*Math.PI/2;root.add(signMesh);
  batchArchitecture(pieces,root,new Set(this.floorBlockers));
  // Bench intentionally has no collision collider: visitors can never become trapped.
 }
 private connectRooms(){
  const {x,z,length,width,height}=passage;
  const wall=new THREE.MeshStandardMaterial({color:0x393c2e,roughness:.9}),stone=new THREE.MeshStandardMaterial({color:0x8b7c61,roughness:.8});
  this.box(length,.16,width,stone,x,-.08,z);this.box(length,.16,width,stone,x,height+.08,z);
  for(const side of [-1,1]){const mesh=this.box(length,height,.2,wall,x,height/2,z+side*(width/2+.1));mesh.updateMatrixWorld();this.floorBlockers.push(mesh);}
 }
 private hang(a:Artwork){
  const r=roomFor(a.room);
  const group=new THREE.Group();let center:THREE.Vector3;let rotation:number;
  if(a.wall==='north'){center=new THREE.Vector3(a.offset,a.centerY,-r.depth/2+.14);rotation=0;}else if(a.wall==='south'){center=new THREE.Vector3(-a.offset,a.centerY,r.depth/2-.14);rotation=Math.PI;}else if(a.wall==='east'){center=new THREE.Vector3(r.width/2-.14,a.centerY,a.offset);rotation=-Math.PI/2;}else{center=new THREE.Vector3(-r.width/2+.14,a.centerY,-a.offset);rotation=Math.PI/2;}center.x+=r.x;center.z+=r.z;
  const normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);group.position.copy(center);group.rotation.y=rotation;this.scene.add(group);
  const height=a.height,width=height*a.sourceWidth/a.sourceHeight;
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
  const railY=theme.room.height-ceilingGap-centerY;
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
  for(const h of this.hung){h.group.visible=visible.has(h.a.room??'rembrandt');if(!h.group.visible)continue;
   const distance=Math.max(.1,this.camera.position.distanceTo(h.center)),pixels=h.a.height/distance*this.container.clientHeight/(2*Math.tan(this.camera.fov*Math.PI/360));
   h.detail.visible=pixels>(h.detail.visible?130:160);
  }
  this.lightingClock+=dt;if(changed||this.lightingClock>.1){this.lightingClock=0;this.lightPool.update(this.pictureLights,this.camera,this.frustum,visible,theme.lighting.spotIntensity);}
 }
 private loadLOD(h:Hung,level:number){if(h.lod===level)return;h.lod=level;const existing=h.textures.get(level);if(existing){(h.mesh.material as THREE.MeshBasicMaterial).map=existing;(h.mesh.material as THREE.MeshBasicMaterial).needsUpdate=true;this.renderDirty=true;return;}
  new THREE.TextureLoader().load(h.a.variants[level].url!,texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());if(h.lod!==level){texture.dispose();return;}h.textures.set(level,texture);if(h.lod===level){const m=h.mesh.material as THREE.MeshBasicMaterial;m.map=texture;m.needsUpdate=true;this.renderDirty=true;for(const [oldLevel,oldTexture]of h.textures){if(oldLevel!==level){oldTexture.dispose();h.textures.delete(oldLevel);}}}},undefined,()=>{h.lod=-1;this.onStatus(`${h.a.title}展示图载入失败，请刷新重试`);});
 }
 private focusPose(h:Hung){const uiAllowance=this.container.clientHeight<=520?1.4:this.container.clientWidth<=700&&this.camera.aspect>=1?1.3:1;const distance=fitDistance(h.width+2*h.frameBorder,h.a.height+2*h.frameBorder,this.camera.aspect,this.camera.fov)*uiAllowance;const position=h.center.clone().addScaledVector(h.normal,distance);this.bound(position,h.a.room??'rembrandt');return {position,yaw:Math.atan2(h.normal.x,h.normal.z)};}
 focus(id:string){const h=this.hung.find(x=>x.a.id===id);if(!h)return;const pose=this.focusPose(h),route=planWalk(this.camera.position,pose.position);if(!route.length)return;this.floorWalk=null;this.destinationMarker.hide();this.selected=id;this.manual=false;this.keys.clear();this.stick={x:0,y:0};const crossing=roomAt(this.camera.position)?.id!==(h.a.room??'rembrandt');const duration=crossing?Math.max(1050,this.routeLength(this.camera.position,route)/2.65*1000):1050;this.flight={start:this.camera.position.clone(),end:pose.position,fromYaw:this.yaw,toYaw:shortestAngle(this.yaw,pose.yaw),fromPitch:this.pitch,startTime:performance.now(),id,route,duration};this.onSelect(h.a,false,true);this.onStatus(`走向《${h.a.title}》 · 拖动或移动可取消`);}
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
  if(rooms.some(r=>Math.abs(point.x-r.x)<1.82&&Math.abs(point.z-r.z-.7)<.55))return null;
  return point;
 }
 private walkTo(point:THREE.Vector3){
  const route=planWalk(this.camera.position,point);if(!route.length)return;
  this.cancel();this.selected=null;this.onRoam();this.keys.clear();this.stick={x:0,y:0};
  const end=new THREE.Vector3(point.x,this.camera.position.y,point.z);
  this.floorWalk={start:this.camera.position.clone(),end,route,startTime:performance.now(),duration:Math.max(400,this.routeLength(this.camera.position,route)/2.65*1000)};
  this.destinationMarker.show(point);this.floorMarker.hide();this.onStatus('走向光圈 · 可环顾，按方向键或 Esc 停止');
 }
 private updateFloorWalk(now:number){
  const walk=this.floorWalk;if(!walk)return;
  const t=clamp((now-walk.startTime)/walk.duration,0,1),ease=t*t*(3-2*t);
  const point=positionOnRoute(walk.start,walk.route,ease);this.camera.position.set(point.x,walk.start.y,point.z);
  if(t===1){this.floorWalk=null;this.destinationMarker.hide();this.onStatus('已到达 · 看向地板可继续选择位置');}
 }
 private setHover(hit:THREE.Object3D|null,immediate=false){
  const h=hit?this.hung.find(h=>h.a.id===hit.userData.id):undefined;
  const label=!!h&&hit!.userData.kind==='label';
  this.container.classList.toggle('is-hovering-artwork',!!h&&!label);
  this.container.classList.toggle('is-hovering-label',label);
  if(!h){this.hoverHighlight.dismiss(immediate);return;}
  if(label){const geometry=(hit as THREE.Mesh<THREE.PlaneGeometry>).geometry;this.hoverHighlight.show(hit!,geometry.parameters.width,geometry.parameters.height,.009);}
  else this.hoverHighlight.show(h.group,h.width+h.frameBorder*2,h.a.height+h.frameBorder*2,.07+h.frameBorder);
 }
 private pick(x:number,y:number,click:boolean,center=false){
  if(this.suspended||this.mouseControls.paused){this.floorMarker.hide();this.setHover(null,true);return;}
  const r=this.renderer.domElement.getBoundingClientRect();if(center)this.pointer.set(0,0);else this.pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.camera.updateMatrixWorld();this.ray.setFromCamera(this.pointer,this.camera);
  const hit=this.ray.intersectObjects([...this.targets,...this.floorBlockers])[0];
  const floor=this.floorTarget();
  const isFloor=!!floor&&(!hit||this.camera.position.distanceTo(floor)<hit.distance);
  const isArtwork=!!hit&&!!hit.object.userData.id&&!isFloor;
  this.setHover(isArtwork?hit.object:null);
  this.container.classList.toggle('is-aiming',isFloor||isArtwork);
  if(isFloor){
   if(!this.floorWalk||floor.distanceTo(new THREE.Vector3(this.floorWalk.end.x,0,this.floorWalk.end.z))>.45)this.floorMarker.show(floor);else this.floorMarker.hide();
   if(click)this.walkTo(floor);return;
  }
  this.floorMarker.hide();if(!isArtwork)return;
  const h=this.hung.find(h=>h.a.id===hit.object.userData.id)!;if(!click)return;
  if(hit.object.userData.kind==='label'){this.onInfo(h.a);return;}
  const pose=this.focusPose(h);
  if(canOpen(this.selected,h.a.id,!!this.flight||this.manual,this.camera.position.distanceTo(pose.position)))this.onOpen(h.a);else this.focus(h.a.id);
 }
 private bind(){const c=this.renderer.domElement;const signal=this.abort.signal;
  // Mouse look/clicks are handled by pointer lock; touch keeps its independent drag and tap controls.
  c.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||this.suspended)return;this.touches.add(e.pointerId);if(this.touches.size>1){this.drag=null;return;}if(e.button!==0)return;c.setPointerCapture(e.pointerId);this.pick(e.clientX,e.clientY,false);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,max:0};},{signal});
  c.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||this.suspended)return;const d=this.drag;if(!d||d.id!==e.pointerId)return;d.max=Math.max(d.max,Math.hypot(e.clientX-d.x,e.clientY-d.y));if(d.max>6)this.turnView(e.clientX-d.lastX,e.clientY-d.lastY,true);d.lastX=e.clientX;d.lastY=e.clientY;},{signal});
  const end=(e:PointerEvent)=>{if(e.pointerType==='mouse')return;const d=this.drag;this.touches.delete(e.pointerId);if(d?.id===e.pointerId){this.drag=null;if(e.type==='pointerup'&&d.max<=6&&!this.suspended)this.pick(e.clientX,e.clientY,true);this.setHover(null);}};
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
  if(this.flight){const f=this.flight;const t=clamp((performance.now()-f.startTime)/f.duration,0,1);const ease=t*t*(3-2*t);const point=positionOnRoute(f.start,f.route,ease);this.camera.position.set(point.x,THREE.MathUtils.lerp(f.start.y,f.end.y,ease),point.z);this.yaw=THREE.MathUtils.lerp(f.fromYaw,f.toYaw,ease);this.pitch=f.fromPitch*(1-ease);if(t===1){this.flight=null;this.manual=false;const h=this.hung.find(h=>h.a.id===f.id)!;this.onSelect(h.a,true,false);this.onStatus(`驻足审视 · 再点画面进入高清 / 点击展签读介绍`);}}
  let forward=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-this.stick.y;
  let side=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.stick.x;
  const length=Math.hypot(forward,side);if(length){if(length>1){forward/=length;side/=length;}const s=dt*2.65,p=this.camera.position;const next=moveOnFloor(p,{x:p.x+(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*s,z:p.z+(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*s});p.x=next.x;p.z=next.z;this.manual=true;this.onStatus('自由漫游 · 点击画作，驻足审视');}
 }
 this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.updateVisibility(dt);this.lodClock+=dt;if(this.lodClock>.7){this.lodClock=0;for(const h of this.hung){if(!h.group.visible)continue;const distance=this.camera.position.distanceTo(h.center);const projectedPixels=h.a.height/distance*this.container.clientHeight/(2*Math.tan(this.camera.fov*Math.PI/360))*this.renderer.getPixelRatio();this.loadLOD(h,projectedPixels>1450?2:projectedPixels>500?1:0);}}
 if(this.mouseControls.locked)this.pick(0,0,false,true);else{this.floorMarker.hide();if(!this.drag)this.setHover(null);}const now=performance.now();this.floorMarker.animate(now);this.destinationMarker.animate(now);this.hoverHighlight.animate(dt,now);this.renderer.render(this.scene,this.camera);
 this.renderDirty=false;this.lastRenderPosition.copy(this.camera.position);this.lastRenderYaw=this.yaw;this.lastRenderPitch=this.pitch;
 }
}
