import * as THREE from 'three';
import { theme } from './data/theme';
import { fitDistance, shortestAngle, clamp, canOpen } from './navigation.mjs';
import type { Artwork } from './types';
import {OrnateFrames} from './ornate-frame';
interface Hung {a:Artwork; group:THREE.Group; center:THREE.Vector3; normal:THREE.Vector3; width:number; frameBorder:number; mesh:THREE.Mesh; lod:number; textures:Map<number,THREE.Texture>}
interface Flight {start:THREE.Vector3;end:THREE.Vector3;fromYaw:number;toYaw:number;fromPitch:number;startTime:number;id:string}
export class Gallery {
 readonly renderer: THREE.WebGLRenderer;
 readonly camera=new THREE.PerspectiveCamera(52,1,.05,80);
 private scene=new THREE.Scene();private hung: Hung[]=[];private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();
 private targets:THREE.Object3D[]=[];private clock=new THREE.Clock();private yaw=0;private pitch=0;
 private keys=new Set<string>();private stick={x:0,y:0};private flight:Flight|null=null;private selected:string|null=null;
 private drag:{id:number;x:number;y:number;lastX:number;lastY:number;max:number}|null=null;
 private touches=new Set<number>();private suspended=false;private lodClock=0;private manual=false;
 private abort=new AbortController();private observer:ResizeObserver;
 private frames:OrnateFrames;
 constructor(private container:HTMLElement, artworks:Artwork[], private onSelect:(a:Artwork,arrived:boolean,moving:boolean)=>void,private onOpen:(a:Artwork)=>void,private onInfo:(a:Artwork)=>void,private onStatus:(text:string)=>void){
  this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  this.frames=new OrnateFrames(theme.frame,this.renderer.capabilities.getMaxAnisotropy());
  this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));this.renderer.setClearColor(0x18392e);
  this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;
  container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','3D展厅，拖动转向，WASD或方向键漫游，底部作品导航可直接驻足');
  this.camera.position.set(theme.initial.x,theme.initial.y,theme.initial.z);this.camera.rotation.order='YXZ';this.yaw=theme.initial.yaw;
  this.room();artworks.forEach(a=>this.hang(a));this.bind();
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);this.resize();this.renderer.setAnimationLoop(()=>this.frame());
 }
 get state(){return {position:this.camera.position.toArray(),yaw:this.yaw,pitch:this.pitch,selected:this.selected,moving:!!this.flight,suspended:this.suspended,stick:this.stick,loadedTextures:this.hung.reduce((n,h)=>n+h.textures.size,0)};}
 suspend(value:boolean){this.suspended=value;this.keys.clear();this.stick={x:0,y:0};this.drag=null;this.touches.clear();if(value&&this.flight)this.cancel();}
 setStick(x:number,y:number){this.stick={x,y};if(x||y)this.cancel();}
 reset(){this.cancel();this.camera.position.set(theme.initial.x,theme.initial.y,theme.initial.z);this.yaw=theme.initial.yaw;this.pitch=0;this.selected=null;this.onStatus('自由漫游 · 点击画作，驻足审视');}
 private box(w:number,h:number,d:number,material:THREE.Material,x:number,y:number,z:number,parent:THREE.Object3D=this.scene){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);parent.add(m);return m;}
 private room(){
  const {width:w,depth:d,height:h,wall:color}=theme.room;
  const wall=new THREE.MeshStandardMaterial({color,roughness:.9});const trim=new THREE.MeshStandardMaterial({color:0xa58b55,metalness:.45,roughness:.55});const dark=new THREE.MeshStandardMaterial({color:0x152e25});
  this.box(w,h,.2,wall,0,h/2,-d/2-.1);this.box(w,h,.2,wall,0,h/2,d/2+.1);
  this.box(.2,h,d,wall,-w/2-.1,h/2,0);this.box(.2,h,d,wall,w/2+.1,h/2,0);
  // Parquet is a small repeat texture generated locally, never a network image.
  const c=document.createElement('canvas');c.width=512;c.height=512;const ctx=c.getContext('2d')!;ctx.fillStyle='#63503a';ctx.fillRect(0,0,512,512);
  let seed=71;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let row=0;row<8;row++)for(let col=0;col<4;col++){const x=col*128+(row%2)*64;const y=row*64;const v=Math.floor(random()*20);ctx.fillStyle=`rgb(${103+v},${82+v},${58+v})`;ctx.fillRect(x,y,126,62);for(let k=0;k<15;k++){ctx.strokeStyle=`rgba(36,24,11,${random()*.12})`;ctx.beginPath();ctx.moveTo(x,y+random()*62);ctx.lineTo(x+126,y+random()*62);ctx.stroke();}}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(10,8.5);
  const floor=new THREE.MeshStandardMaterial({map:tex,roughness:.7});this.box(w,.16,d,floor,0,-.08,0);
  const ceiling=new THREE.MeshStandardMaterial({color:0xc3b797,roughness:.85});this.box(w,.15,d,ceiling,0,h+.07,0);
  for(const y of [.18,1.02,5.55,5.8]){const thickness=y>5?.12:.035;this.box(w,thickness,.09,y===.18?dark:trim,0,y,-d/2+.045);this.box(w,thickness,.09,y===.18?dark:trim,0,y,d/2-.045);this.box(.09,thickness,d,y===.18?dark:trim,-w/2+.045,y,0);this.box(.09,thickness,d,y===.18?dark:trim,w/2-.045,y,0);}
  for(let x=-8;x<=8;x+=4){this.box(.08,4.3,.04,dark,x,3.25,-d/2+.025);this.box(.08,4.3,.04,dark,x,3.25,d/2-.025);this.box(.1,.12,d,ceiling,x,5.94,0);}
  for(let z=-6;z<=6;z+=4){this.box(.04,4.3,.07,dark,-w/2+.025,3.25,z);this.box(.04,4.3,.07,dark,w/2-.025,3.25,z);this.box(w,.12,.1,ceiling,0,5.94,z);}
  this.scene.add(new THREE.HemisphereLight(0xffefd2,0x676048,theme.lighting.ambient));
  const light=new THREE.DirectionalLight(0xffe4b5,theme.lighting.key);light.position.set(0,5,2);this.scene.add(light);
  // Slim ceiling tracks keep every wall's picture lights aligned.
  const track=new THREE.MeshStandardMaterial({color:0x242821,metalness:.55,roughness:.5});
  const railY=h-theme.lighting.ceilingGap,railInset=theme.lighting.railInset;
  for(const sign of [-1,1]){
   this.box(w-.7,.055,.08,track,0,railY,sign*(d/2-railInset));
   this.box(.08,.055,d-.7,track,sign*(w/2-railInset),railY,0);
  }
  // Warm ceiling luminaires, restrained geometry.
  const luminous=new THREE.MeshBasicMaterial({color:0xffe5ac});
  for(const z of [-4,3]){this.box(2.6,.04,.5,luminous,0,5.7,z);this.box(2.7,.08,.6,trim,0,5.77,z);}
  const bench=new THREE.Group();this.scene.add(bench);const wood=new THREE.MeshStandardMaterial({color:0x34271c,roughness:.55});const leather=new THREE.MeshStandardMaterial({color:0x44392d,roughness:.8});
  this.box(3.6,.16,1,leather,0,.62,.7,bench);for(const x of [-1.4,1.4])for(const z of [.36,1.04])this.box(.09,.55,.09,wood,x,.28,z,bench);
  // Bench intentionally has no collision collider: visitors can never become trapped.
 }
 private hang(a:Artwork){
  const group=new THREE.Group();let center:THREE.Vector3;let rotation:number;
  if(a.wall==='north'){center=new THREE.Vector3(a.offset,a.centerY,-theme.room.depth/2+.14);rotation=0;}else if(a.wall==='south'){center=new THREE.Vector3(-a.offset,a.centerY,theme.room.depth/2-.14);rotation=Math.PI;}else if(a.wall==='east'){center=new THREE.Vector3(theme.room.width/2-.14,a.centerY,a.offset);rotation=-Math.PI/2;}else{center=new THREE.Vector3(-9.86,a.centerY,-a.offset);rotation=Math.PI/2;}
  const normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);group.position.copy(center);group.rotation.y=rotation;this.scene.add(group);
  const height=a.height,width=height*a.sourceWidth/a.sourceHeight;
  const frame=this.frames.create(width,height);group.add(frame.group);frame.hitMesh.userData={id:a.id,kind:'art'};this.targets.push(frame.hitMesh);
  const mat=new THREE.MeshBasicMaterial({color:0xffffff});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),mat);mesh.position.z=.085;mesh.userData={id:a.id,kind:'art'};group.add(mesh);this.targets.push(mesh);
  const labelCanvas=document.createElement('canvas');labelCanvas.width=1000;labelCanvas.height=370;const ctx=labelCanvas.getContext('2d')!;
  ctx.fillStyle='#efe8d7';ctx.fillRect(0,0,1000,370);ctx.strokeStyle='#b9a883';ctx.lineWidth=3;ctx.strokeRect(15,15,970,340);
  ctx.fillStyle='#303b31';ctx.font=`500 ${a.title.length>10?45:56}px "PingFang SC", "Microsoft YaHei", sans-serif`;ctx.fillText(a.title,55,110,890);ctx.font='36px "PingFang SC", sans-serif';ctx.fillText(a.author,55,205,890);ctx.fillStyle='#6e705d';ctx.fillText(a.date,55,290,890);
  const lt=new THREE.CanvasTexture(labelCanvas);lt.colorSpace=THREE.SRGBColorSpace;const label=new THREE.Mesh(new THREE.PlaneGeometry(.7,.259),new THREE.MeshBasicMaterial({map:lt}));
  label.position.set(width/2+frame.border+.43,-height/2-frame.border+.16,.09);label.userData={id:a.id,kind:'label'};group.add(label);this.targets.push(label);
  const hung: Hung={a,group,center,normal,width,frameBorder:frame.border,mesh,lod:-1,textures:new Map()};this.hung.push(hung);this.loadLOD(hung,0);
  this.pictureLight(group,width,height,a.centerY);
 }
 private pictureLight(parent:THREE.Group,width:number,height:number,centerY:number){
  const {spotColor,spotIntensity,railInset,ceilingGap}=theme.lighting;
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
  const spot=new THREE.SpotLight(spotColor,spotIntensity,9,angle,.65,2);
  spot.position.copy(head.position).addScaledVector(direction,.17);
  const target=new THREE.Object3D();target.position.copy(aim);parent.add(target);spot.target=target;
  // No shadow maps or volumetric cones: small warm pools on the wall and gold frame.
  spot.castShadow=false;parent.add(spot);
 }
 private loadLOD(h:Hung,level:number){if(h.lod===level)return;h.lod=level;const existing=h.textures.get(level);if(existing){(h.mesh.material as THREE.MeshBasicMaterial).map=existing;(h.mesh.material as THREE.MeshBasicMaterial).needsUpdate=true;return;}
  new THREE.TextureLoader().load(h.a.variants[level].url!,texture=>{texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());if(h.lod!==level){texture.dispose();return;}h.textures.set(level,texture);if(h.lod===level){const m=h.mesh.material as THREE.MeshBasicMaterial;m.map=texture;m.needsUpdate=true;for(const [oldLevel,oldTexture]of h.textures){if(oldLevel!==level){oldTexture.dispose();h.textures.delete(oldLevel);}}}},undefined,()=>{h.lod=-1;this.onStatus(`${h.a.title}展示图载入失败，请刷新重试`);});
 }
 private focusPose(h:Hung){const uiAllowance=this.container.clientHeight<=520?1.4:this.container.clientWidth<=700?1.3:1;const distance=fitDistance(h.width+2*h.frameBorder,h.a.height+2*h.frameBorder,this.camera.aspect,this.camera.fov)*uiAllowance;const position=h.center.clone().addScaledVector(h.normal,distance);this.bound(position);return {position,yaw:Math.atan2(h.normal.x,h.normal.z)};}
 focus(id:string){const h=this.hung.find(x=>x.a.id===id);if(!h)return;const pose=this.focusPose(h);this.selected=id;this.manual=false;this.keys.clear();this.stick={x:0,y:0};this.flight={start:this.camera.position.clone(),end:pose.position,fromYaw:this.yaw,toYaw:shortestAngle(this.yaw,pose.yaw),fromPitch:this.pitch,startTime:performance.now(),id};this.onSelect(h.a,false,true);this.onStatus(`走向《${h.a.title}》 · 拖动或移动可取消`);}
 private cancel(){if(this.flight)this.flight=null;if(!this.manual&&this.selected){const h=this.hung.find(h=>h.a.id===this.selected);if(h)this.onSelect(h.a,false,false);}this.manual=true;}
 private bound(p:THREE.Vector3){p.x=clamp(p.x,-theme.room.width/2+theme.room.margin,theme.room.width/2-theme.room.margin);p.z=clamp(p.z,-theme.room.depth/2+theme.room.margin,theme.room.depth/2-theme.room.margin);}
 private pick(x:number,y:number,click:boolean){const r=this.renderer.domElement.getBoundingClientRect();this.pointer.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera);const hit=this.ray.intersectObjects(this.targets)[0];if(!hit){if(!click)this.renderer.domElement.style.cursor='grab';return;}
  const h=this.hung.find(h=>h.a.id===hit.object.userData.id)!;if(!click){this.renderer.domElement.style.cursor='pointer';return;}
  if(hit.object.userData.kind==='label'){this.onInfo(h.a);return;}
  const pose=this.focusPose(h);
  if(canOpen(this.selected,h.a.id,!!this.flight,this.camera.position.distanceTo(pose.position),shortestAngle(this.yaw,pose.yaw)-this.yaw,this.pitch))this.onOpen(h.a);else this.focus(h.a.id);
 }
 private bind(){const c=this.renderer.domElement;const signal=this.abort.signal;
  c.addEventListener('pointerdown',e=>{if(this.suspended)return;this.touches.add(e.pointerId);if(this.touches.size>1){this.drag=null;return;}if(e.button!==0)return;c.setPointerCapture(e.pointerId);this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,max:0};},{signal});
  c.addEventListener('pointermove',e=>{if(this.suspended)return;const d=this.drag;if(!d){if(e.pointerType==='mouse')this.pick(e.clientX,e.clientY,false);return;}if(d.id!==e.pointerId)return;d.max=Math.max(d.max,Math.hypot(e.clientX-d.x,e.clientY-d.y));if(d.max>6){this.cancel();this.yaw+=(e.clientX-d.lastX)*.004;this.pitch=clamp(this.pitch+(e.clientY-d.lastY)*.003,-.8,.8);this.onStatus('自由漫游 · 点击画作，驻足审视');}d.lastX=e.clientX;d.lastY=e.clientY;},{signal});
  const end=(e:PointerEvent)=>{const d=this.drag;this.touches.delete(e.pointerId);if(d?.id===e.pointerId){this.drag=null;if(e.type==='pointerup'&&d.max<=6&&!this.suspended)this.pick(e.clientX,e.clientY,true);}};
  c.addEventListener('pointerup',end,{signal});c.addEventListener('pointercancel',end,{signal});c.addEventListener('lostpointercapture',()=>{this.drag=null;},{signal});
  window.addEventListener('keydown',e=>{if(this.suspended||/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))return;if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();this.keys.add(e.code);this.cancel();}if(e.code==='Escape')this.cancel();},{signal});
  window.addEventListener('keyup',e=>this.keys.delete(e.code),{signal});window.addEventListener('blur',()=>{this.keys.clear();this.stick={x:0,y:0};this.drag=null;this.touches.clear();},{signal});
  c.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onStatus('展厅图形上下文暂时丢失，正在等待恢复…');},{signal});c.addEventListener('webglcontextrestored',()=>this.onStatus('展厅已恢复'),{signal});
 }
 private resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.selected&&!this.manual&&!this.suspended)this.focus(this.selected);}
 private frame(){const dt=Math.min(this.clock.getDelta(),.04);if(!this.suspended){
  if(this.flight){const f=this.flight;const t=clamp((performance.now()-f.startTime)/1050,0,1);const ease=t*t*(3-2*t);this.camera.position.lerpVectors(f.start,f.end,ease);this.yaw=THREE.MathUtils.lerp(f.fromYaw,f.toYaw,ease);this.pitch=f.fromPitch*(1-ease);if(t===1){this.flight=null;this.manual=false;const h=this.hung.find(h=>h.a.id===f.id)!;this.onSelect(h.a,true,false);this.onStatus(`驻足审视 · 再点画面进入高清 / 点击展签读介绍`);}}
  let forward=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0)-this.stick.y;
  let side=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0)+this.stick.x;
  const length=Math.hypot(forward,side);if(length){if(length>1){forward/=length;side/=length;}const s=dt*2.65;this.camera.position.x+=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*side)*s;this.camera.position.z+=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*side)*s;this.bound(this.camera.position);this.manual=true;this.onStatus('自由漫游 · 点击画作，驻足审视');}
 }
 this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');this.lodClock+=dt;if(this.lodClock>.7){this.lodClock=0;for(const h of this.hung){const distance=this.camera.position.distanceTo(h.center);const projectedPixels=h.a.height/distance*this.container.clientHeight/(2*Math.tan(this.camera.fov*Math.PI/360))*Math.min(devicePixelRatio,1.6);this.loadLOD(h,projectedPixels>1450?2:projectedPixels>500?1:0);}}
 if(!this.suspended)this.renderer.render(this.scene,this.camera);
 }
}
