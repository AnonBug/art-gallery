import * as THREE from 'three';
import {sculpturePedestalHeight} from './museum-layout.mjs';
import type {Sculpture} from './sculpture-model';

// Rounded square sections keep the stone's bevels visible at grazing angles.
function stoneSection(width:number,depth:number,height:number,topScale=1){
 const positions:number[]=[],uv:number[]=[],indices:number[]=[];
 const bevel=Math.min(.018,height/4),rings=[[0,1-.025],[bevel,1],[height-bevel,topScale],[height,topScale-.025]];
 const segments=32;
 for(const [y,scale]of rings)for(let i=0;i<segments;i++){
  const corner=Math.floor(i/8),angle=-Math.PI/2+corner*Math.PI/2+(i%8)/7*Math.PI/2;
  const radius=.055,halfX=width*scale/2,halfZ=depth*scale/2;
  const cx=[1,1,-1,-1][corner]*(halfX-radius),cz=[-1,1,1,-1][corner]*(halfZ-radius);
  positions.push(cx+Math.cos(angle)*radius,y,cz+Math.sin(angle)*radius);uv.push(i/segments,y/.7);
 }
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<segments;i++){const a=r*segments+i,b=r*segments+(i+1)%segments,c=a+segments,d=b+segments;indices.push(a,c,b,b,c,d);}
 // Convex caps; the bottom winding faces down, the upper winding faces up.
 for(let i=1;i<segments-1;i++){indices.push(0,i,i+1);const top=(rings.length-1)*segments;indices.push(top,top+i+1,top+i);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
 // Separate surface normals prevent cap triangulation from rippling the bevels.
 const flat=geometry.toNonIndexed();geometry.dispose();flat.computeVertexNormals();return flat;
}

function limestoneTexture(anisotropy:number){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#eee9df';ctx.fillRect(0,0,512,512);
 let seed=321;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 for(let i=0;i<28000;i++){const shade=random()>.5?'65,60,50':'255,255,255';ctx.fillStyle=`rgba(${shade},${.015+random()*.045})`;const size=.4+random()*1.8;ctx.fillRect(random()*512,random()*512,size,size);}
 for(let line=0;line<16;line++){const y=random()*512;ctx.strokeStyle=`rgba(105,95,78,${.025+random()*.03})`;ctx.lineWidth=.5+random();ctx.beginPath();for(let x=0;x<=512;x+=8){const py=y+Math.sin(x*.015+line)*7+Math.sin(x*.05)*2;if(!x)ctx.moveTo(x,py);else ctx.lineTo(x,py);}ctx.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=Math.min(8,anisotropy);return texture;
}

export function createSculpturePedestal(s:Sculpture,anisotropy:number){
 const root=new THREE.Group();root.name=`pedestal-${s.id}`;
 const map=limestoneTexture(anisotropy);
 const stone=new THREE.MeshStandardMaterial({map,color:s.id==='nefertiti'?0xd2c5ac:0xb7b4aa,roughness:.76});
 const top=new THREE.MeshStandardMaterial({map,color:0xe1d8c5,roughness:.65});
 const bronze=new THREE.MeshStandardMaterial({color:0x9f8455,metalness:.7,roughness:.42});
 const dark=new THREE.MeshStandardMaterial({color:0x252c2a,roughness:.85});
 const section=(size:number,bottom:number,height:number,material:THREE.Material,topScale=1)=>{const mesh=new THREE.Mesh(stoneSection(size,size,height,topScale),material);mesh.position.y=bottom;root.add(mesh);};
 // A low, stepped foot and recessed reveal make the tall shaft feel lighter.
 section(1.86,0,.105,stone);section(1.86,.105,.055,stone,.92);
 section(1.62,.16,.04,dark);section(1.7,.20,.012,bronze);
 section(1.7,.212,.06,stone,.86);
 section(1.46,.272,1.03,stone,.91);
 section(1.5,1.302,.058,stone);section(1.5,1.36,.06,stone,1.28);
 section(1.92,1.42,.012,bronze);section(1.98,1.432,sculpturePedestalHeight-1.432,top);

 const plaque=new THREE.Mesh(new THREE.BoxGeometry(1.16,.42,.028),bronze);plaque.position.set(0,.88,.709);root.add(plaque);
 const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=512;const ctx=canvas.getContext('2d')!;
 ctx.fillStyle='#263430';ctx.fillRect(0,0,1536,512);ctx.textAlign='center';ctx.fillStyle='#c5ae7e';ctx.font='31px sans-serif';ctx.fillText(s.labelAuthor,768,91);
 ctx.strokeStyle='#9e885c';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(180,132);ctx.lineTo(1356,132);ctx.stroke();
 ctx.fillStyle='#f0e6cf';ctx.font='66px "Songti SC",serif';ctx.fillText(s.title,768,241,1400);
 ctx.fillStyle='#d0c5ad';ctx.font='29px sans-serif';ctx.fillText('作品介绍  →',768,345);
 ctx.fillStyle='#b4b09f';ctx.font='23px sans-serif';ctx.fillText(`${s.labelCredit}  /  ${s.license}`,768,441);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,anisotropy);
 const label=new THREE.Mesh(new THREE.PlaneGeometry(1.12,.38),new THREE.MeshBasicMaterial({map:texture}));label.position.set(0,.88,.725);label.userData={id:s.id,kind:'sculpture-label'};root.add(label);
 // Baked contact shadow: no extra realtime lights or shadow maps.
 const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;const shadowContext=shadowCanvas.getContext('2d')!;
 const gradient=shadowContext.createRadialGradient(64,64,24,64,64,64);gradient.addColorStop(0,'#0009');gradient.addColorStop(1,'#0000');shadowContext.fillStyle=gradient;shadowContext.fillRect(0,0,128,128);
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.7,2.7),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.005;root.add(shadow);
 return {root,label};
}
