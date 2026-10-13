import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {loadSculpture,sculptureFor,type Sculpture} from './sculpture-model';
import {fitDistance} from './navigation.mjs';

export class SculptureViewer {
 readonly root=document.createElement('section');
 private renderer:THREE.WebGLRenderer|null=null;private controls:OrbitControls|null=null;
 private observer:ResizeObserver|null=null;private token=0;private previousFocus:HTMLElement|null=null;
 private grid:THREE.GridHelper|null=null;private model:THREE.Group|null=null;private scene:THREE.Scene|null=null;
 private camera=new THREE.PerspectiveCamera(42,1,.01,100);private distance=5;private sculpture:Sculpture|null=null;
 constructor(private onChange:(open:boolean,resume?:boolean)=>void,private onInfo:(s:Sculpture)=>void){
  this.root.className='sculpture-overlay';this.root.hidden=true;this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','sculpture-title');
  this.root.innerHTML=`<header class="sculpture-header"><div><span class="eyebrow">雕塑 / SCULPTURE STUDY</span><h2 id="sculpture-title"></h2></div><div><button id="sculpture-info">作品介绍</button><button id="sculpture-close">返回展厅 ✕</button></div></header><div class="sculpture-stage" aria-label="雕塑3D查看器：拖动旋转，滚轮或双指缩放，右键或双指平移"></div><div class="sculpture-status" role="status"></div><footer class="sculpture-footer"><p>拖动旋转 · 滚轮 / 双指缩放 · 右键 / 双指平移</p><div><button id="sculpture-reset">重置视角</button><button id="sculpture-rotate" aria-pressed="false">自动旋转</button><button id="sculpture-grid" aria-pressed="false">参考网格</button></div><small class="sculpture-credit"></small></footer>`;
  document.body.append(this.root);
  this.root.querySelector('#sculpture-close')!.addEventListener('click',()=>this.close(true));
  this.root.querySelector('#sculpture-info')!.addEventListener('click',()=>{if(this.sculpture)this.onInfo(this.sculpture);});
  this.root.querySelector('#sculpture-reset')!.addEventListener('click',()=>this.reset());
  this.root.querySelector('#sculpture-rotate')!.addEventListener('click',()=>{if(this.controls){this.controls.autoRotate=!this.controls.autoRotate;this.root.querySelector('#sculpture-rotate')!.setAttribute('aria-pressed',String(this.controls.autoRotate));}});
  this.root.querySelector('#sculpture-grid')!.addEventListener('click',()=>{if(this.grid){this.grid.visible=!this.grid.visible;this.root.querySelector('#sculpture-grid')!.setAttribute('aria-pressed',String(this.grid.visible));}});
 }
 get isOpen(){return !this.root.hidden;}
 get state(){return {open:this.isOpen,id:this.sculpture?.id,loaded:!!this.model,autoRotate:this.controls?.autoRotate??false,grid:this.grid?.visible??false,camera:this.camera.position.toArray(),target:this.controls?.target.toArray()};}
 async open(id:string){
  const sculpture=sculptureFor(id);
  if(this.isOpen&&this.sculpture?.id===id)return;
  this.sculpture=sculpture;
  this.root.querySelector('#sculpture-title')!.textContent=sculpture.title;
  this.root.querySelector('.eyebrow')!.textContent=`${sculpture.labelAuthor} / SCULPTURE STUDY`;
  const credit=this.root.querySelector('.sculpture-credit')!;credit.replaceChildren(document.createTextNode(`${sculpture.credit} · `));
  for(const [label,url]of [['模型来源 ↗',sculpture.source],[sculpture.license,sculpture.licenseUrl]]){const link=document.createElement('a');link.textContent=label;link.href=url;link.target='_blank';link.rel='noopener noreferrer';credit.append(link,document.createTextNode(' · '));}
  this.previousFocus=document.activeElement as HTMLElement;this.root.hidden=false;this.onChange(true);(this.root.querySelector('#sculpture-close') as HTMLButtonElement).focus();
  await this.mount();
 }
 private async mount(){
  this.release();const token=++this.token;
  const status=this.root.querySelector('.sculpture-status') as HTMLElement;status.hidden=false;status.textContent='正在载入雕塑…';
  const stage=this.root.querySelector('.sculpture-stage') as HTMLElement;
  try{
   const renderer=this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setClearColor(0x24282a);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
   stage.replaceChildren(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label',`可拖动旋转的${this.sculpture!.title}3D雕塑`);
   const scene=this.scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xfff3df,0x5c6474,2));
   for(const [color,intensity,x,y,z]of [[0xffe6c2,3.2,-3,5,4],[0xdce7ff,1.5,4,2,1],[0xffffff,2,1,4,-4]]){const light=new THREE.DirectionalLight(color,intensity);light.position.set(x,y,z);scene.add(light);}
   const controls=this.controls=new OrbitControls(this.camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotateSpeed=.65;controls.maxPolarAngle=Math.PI*.92;controls.addEventListener('start',()=>{controls.autoRotate=false;this.root.querySelector('#sculpture-rotate')!.setAttribute('aria-pressed','false');});
   this.root.querySelector('#sculpture-rotate')!.setAttribute('aria-pressed','false');this.root.querySelector('#sculpture-grid')!.setAttribute('aria-pressed','false');
   const grid=this.grid=new THREE.GridHelper(8,16,0x7d817c,0x454b4d);grid.visible=false;scene.add(grid);
   const resize=()=>{const w=stage.clientWidth,h=stage.clientHeight;if(!w||!h)return;renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.distance=fitDistance(2.3,2.5,w/h,42);controls.minDistance=1.4;controls.maxDistance=this.distance*3;if(this.model)this.reset();};
   this.observer=new ResizeObserver(resize);this.observer.observe(stage);resize();
   const clock=new THREE.Clock();renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.05);if(document.hidden||!this.isOpen||this.root.inert)return;controls.update(dt);renderer.render(scene,this.camera);});
   const model=await loadSculpture(this.sculpture!.id,(loaded,total)=>{if(token===this.token)status.textContent=`正在载入雕塑… ${Math.min(100,Math.round(loaded/total*100))}%`;});
   if(token!==this.token)return;this.model=model.clone(true);scene.add(this.model);this.reset();status.hidden=true;
  }catch(error){
   if(token!==this.token)return;this.release();status.hidden=false;status.replaceChildren();const message=document.createElement('p');message.textContent='雕塑载入失败，请检查资源后重试。';const retry=document.createElement('button');retry.textContent='重新载入';retry.addEventListener('click',()=>void this.mount());status.append(message,retry);console.error(error);
  }
 }
 private reset(){if(!this.controls)return;this.controls.target.set(0,1.05,0);this.camera.position.set(this.distance*.45,1.05+this.distance*.2,this.distance*.87);this.camera.near=.01;this.camera.far=Math.max(50,this.distance*5);this.camera.updateProjectionMatrix();this.controls.update();}
 close(resume=false){if(!this.isOpen)return;this.token++;this.release();this.root.hidden=true;this.previousFocus?.focus();this.onChange(false,resume);}
 private release(){this.observer?.disconnect();this.observer=null;this.controls?.dispose();this.controls=null;this.renderer?.setAnimationLoop(null);this.renderer?.dispose();this.renderer?.forceContextLoss();this.renderer?.domElement.remove();this.renderer=null;this.grid?.geometry.dispose();if(this.grid){const materials=Array.isArray(this.grid.material)?this.grid.material:[this.grid.material];materials.forEach(m=>m.dispose());}this.grid=null;this.model=null;this.scene=null;}
}
