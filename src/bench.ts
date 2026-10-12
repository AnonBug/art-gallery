import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Local leather/walnut furniture inspired by the reference museum's Northern rooms.
 * Each material is batched; a baked contact shadow avoids another shadow-map render. */
export function createGalleryBench(anisotropy: number) {
 const group = new THREE.Group();group.name = 'walnut-leather-gallery-bench';
 const textures = surfaceTextures(anisotropy);
 const materials = {
  wood: new THREE.MeshStandardMaterial({map:textures.wood,bumpMap:textures.woodRelief,bumpScale:.0015,roughness:.48,vertexColors:true}),
  leather: new THREE.MeshPhysicalMaterial({map:textures.leather,bumpMap:textures.grain,bumpScale:.0011,roughnessMap:textures.grain,roughness:.82,clearcoat:.12,clearcoatRoughness:.65,vertexColors:true}),
  welt: new THREE.MeshStandardMaterial({color:0x644431,roughness:.66,vertexColors:true}),
  brass: new THREE.MeshStandardMaterial({color:0xa48a56,metalness:.72,roughness:.43,vertexColors:true}),
 };
 type Part = keyof typeof materials;
 const batches:Record<Part,THREE.BufferGeometry[]> = {wood:[],leather:[],welt:[],brass:[]};
 const add=(part:Part,g:THREE.BufferGeometry,x:number,y:number,z:number,shade=1)=>{
  const verticalGrain=part==='wood'&&g.type==='LatheGeometry';
  if(g.index){const indexed=g;g=g.toNonIndexed();indexed.dispose();}
  // World-sized UVs keep grain scale consistent across the frame's joints.
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  const colors=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++) {
   const ny=n.getY(i);
   if(part==='wood')uv.setXY(i,Math.abs(ny)>.6?(p.getX(i)+x)*1.4:(p.getX(i)+x+p.getZ(i)+z)*1.4,Math.abs(ny)>.6?(p.getZ(i)+z)*2:(p.getY(i)+y)*2);
   if(verticalGrain)uv.setXY(i,p.getY(i)*3,Math.atan2(p.getZ(i),p.getX(i))/Math.PI);
   if(part==='leather')uv.setXY(i,(p.getX(i)+x)*4,(Math.abs(ny)>.6?p.getZ(i)+z:p.getY(i)+y)*4);
   const ao=shade*(.72+.28*Math.max(0,ny));colors.set([ao,ao,ao],i*3);
  }
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.translate(x,y,z);batches[part].push(g);
 };
 const box=(part:Part,w:number,h:number,d:number,x:number,y:number,z:number,r=.008,shade=1)=>add(part,new RoundedBoxGeometry(w,h,d,3,r),x,y,z,shade);
 // Rebated seat rails, apron and narrow mouldings under the upholstery.
 for(const z of [-.385,.385]) {
  box('wood',3.32,.105,.065,0,.367,z);
  box('wood',3.43,.025,.085,0,.426,z,.008,1.06);
  box('wood',3.34,.018,.078,0,.315,z,.006,.9);
 }
 for(const x of [-1.66,1.66])box('wood',.065,.105,.77,x,.367,0);
 box('wood',3.4,.035,.83,0,.435,0);
 for(const x of [-1.52,0,1.52]) {
  box('wood',.06,.055,.71,x,.325,0,.006,.82);
  box('wood',.042,.04,.68,x,.135,0,.006,.87);
 }
 for(const z of [-.34,.34])box('wood',3.04,.036,.036,0,.135,z,.006,.87);
 // Six turned legs support the long span, with a foot, collars and baluster.
 const profile=[[.026,.007],[.037,.013],[.04,.028],[.034,.047],[.022,.063],[.022,.095],[.029,.123],[.04,.143],[.042,.161],[.035,.18],[.026,.193],[.025,.215],[.031,.27],[.038,.305],[.039,.318],[.039,.335]];
 for(const x of [-1.52,0,1.52])for(const z of [-.34,.34]) {
  add('wood',new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),20),x,0,z);
  box('wood',.098,.075,.098,x,.367,z,.006);
  add('brass',new THREE.CylinderGeometry(.033,.03,.012,20),x,.011,z,.78);
 }
 // Three crowned cushions; narrow creases break up the long, formerly flat slab.
 for(const x of [-1.17,0,1.17]) {
  const cushion=new RoundedBoxGeometry(1.158,.153,.94,7,.058),p=cushion.getAttribute('position');
  for(let i=0;i<p.count;i++) {
   const px=p.getX(i),py=p.getY(i),pz=p.getZ(i);
   const crown=.018*Math.max(0,1-(px/.579)**2)*Math.max(0,1-(pz/.47)**2);
   if(py>0)p.setY(i,py+crown*Math.min(1,py/.035));
  }
  cushion.computeVertexNormals();add('leather',cushion,x,.513,0);
  for(const y of [.473,.55])add('welt',new THREE.TubeGeometry(roundedOutline(1.145,.929,.07,y),96,.0035,5,true),x,0,0);
 }
 const tackPositions:THREE.Vector3[]=[];
 for(const z of [-.433,.433])for(let i=0;i<47;i++)tackPositions.push(new THREE.Vector3(-1.69+i*3.38/46,.443,z));
 for(const x of [-1.7,1.7])for(let i=1;i<11;i++)tackPositions.push(new THREE.Vector3(x,.443,-.433+i*.866/11));
 const tacks=new THREE.InstancedMesh(new THREE.SphereGeometry(.0045,6,4),materials.brass,tackPositions.length),dummy=new THREE.Object3D();
 tackPositions.forEach((p,i)=>{dummy.position.copy(p);dummy.updateMatrix();tacks.setMatrixAt(i,dummy.matrix);});
 tacks.computeBoundingSphere();group.add(tacks);
 for(const part of Object.keys(batches) as Part[]) {
  const geometry=mergeGeometries(batches[part]);if(geometry)group.add(new THREE.Mesh(geometry,materials[part]));
  batches[part].forEach(g=>g.dispose());
 }
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.3,1.7),new THREE.MeshBasicMaterial({map:contactShadow(),transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false}));
 shadow.name='bench-contact-shadow';shadow.rotation.x=-Math.PI/2;shadow.position.y=.002;shadow.renderOrder=1;group.add(shadow);
 return group;
}

function roundedOutline(w:number,d:number,r:number,y:number) {
 const s=new THREE.Shape();s.moveTo(-w/2+r,-d/2);s.lineTo(w/2-r,-d/2);
 s.absarc(w/2-r,-d/2+r,r,-Math.PI/2,0,false);s.lineTo(w/2,d/2-r);
 s.absarc(w/2-r,d/2-r,r,0,Math.PI/2,false);s.lineTo(-w/2+r,d/2);
 s.absarc(-w/2+r,d/2-r,r,Math.PI/2,Math.PI,false);s.lineTo(-w/2,-d/2+r);
 s.absarc(-w/2+r,-d/2+r,r,Math.PI,Math.PI*1.5,false);
 const points=s.getPoints(8);if(points[0].distanceTo(points[points.length-1])<1e-6)points.pop();
 return new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p.x,y,p.y)),true,'centripetal');
}

function surfaceTextures(anisotropy:number) {
 let seed=83;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 const make=(size:number,paint:(x:number,y:number)=>number[],color=false)=>{
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d')!,data=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)data.data.set([...paint(x,y),255],(y*size+x)*4);
  ctx.putImageData(data,0,0);const t=new THREE.CanvasTexture(c);if(color)t.colorSpace=THREE.SRGBColorSpace;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(4,anisotropy);return t;
 };
 const grain=(x:number,y:number)=>Math.sin(y*.39+Math.sin(x*Math.PI/128)*2+Math.sin(x*Math.PI/64+y*.03)*.8);
 const wood=make(256,(x,y)=>{const v=.9+grain(x,y)*.07+Math.sin(y*.13)*.05+random()*.06;return [104*v,66*v,39*v];},true);
 const woodRelief=make(256,(x,y)=>{const v=135+grain(x,y)*12;return [v,v,v];});
 const leather=make(256,(x,y)=>{const v=.96+random()*.07+Math.sin(x*.07)*Math.cos(y*.09)*.025;return [103*v,65*v,43*v];},true);
 const relief=make(256,(x,y)=>{const v=170+random()*70+Math.sin(x*1.8+Math.sin(y*.7))*9;return [v,v,v];});
 return {wood,woodRelief,leather,grain:relief};
}

function contactShadow() {
 const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d')!,image=ctx.createImageData(c.width,c.height);
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++) {
  const wx=(x/c.width-.5)*4.3,wz=(y/c.height-.5)*1.7,dx=Math.max(0,Math.abs(wx)-1.48),dz=Math.max(0,Math.abs(wz)-.26);
  let alpha=.2*Math.exp(-(dx*dx/.065+dz*dz/.07));
  for(const lx of [-1.52,0,1.52])for(const lz of [-.34,.34])alpha+=.46*Math.exp(-((wx-lx)**2+(wz-lz)**2)/.004);
  image.data.set([22,15,9,Math.min(.68,alpha)*255],(y*c.width+x)*4);
 }
 ctx.putImageData(image,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
