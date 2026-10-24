import * as THREE from 'three';
import {rooms,doorsFor,roomFor} from './museum-layout.mjs';

export const doorwayIdleOpacity=.06;
export const doorwayHoverOpacity=.42;
export type DoorwayTarget=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>&{setHovered:(hovered:boolean)=>void};

// A single translucent floor marking faces the visitor approaching each side of a door.
export function createDoorwayGuide(room:typeof rooms[number],door:ReturnType<typeof doorsFor>[number],anisotropy:number){
 const p=door.passage,next=roomFor(door.next),direction={north:[0,-1],south:[0,1],west:[-1,0],east:[1,0]}[door.side as 'north'|'south'|'west'|'east'];
 const [dx,dz]=direction,inset=2.35;
 const guide=new THREE.Group();guide.name='doorway-floor-guide';guide.userData={from:room.id,to:next.id};
 guide.position.set(p.x-room.x-dx*(inset+p.length/2),.018,p.z-room.z-dz*(inset+p.length/2));
 guide.rotation.y=Math.atan2(-dx,-dz);
 const makeTexture=(showName:boolean)=>{
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=2560;const ctx=canvas.getContext('2d')!;
  // A wide, softly filled arrow carries the name, with the parquet still showing through.
  ctx.fillStyle='rgba(243,236,221,.4)';ctx.strokeStyle='rgba(243,236,221,.7)';ctx.lineWidth=8;ctx.lineJoin='round';
  ctx.shadowColor='rgba(238,229,211,.45)';ctx.shadowBlur=14;
  ctx.beginPath();ctx.moveTo(384,70);ctx.lineTo(708,650);ctx.lineTo(578,650);ctx.lineTo(578,2490);
  ctx.lineTo(190,2490);ctx.lineTo(190,650);ctx.lineTo(60,650);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowBlur=5;ctx.fillStyle='#f3ecdd';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='500 220px "PingFang SC","Microsoft YaHei",sans-serif';
  // Read from the near tail toward the doorway: first character at the bottom,
  // while each individual glyph remains upright for the approaching visitor.
  const characters=showName?Array.from(next.name):[],lineHeight=312,firstY=1560+(characters.length-1)*lineHeight/2;
  characters.forEach((character,index)=>{
   ctx.save();ctx.translate(384,firstY-index*lineHeight);ctx.scale(1,1.3);ctx.fillText(character,0,0);ctx.restore();
  });
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,anisotropy);
  return texture;
 };
 const idleTexture=makeTexture(false),hoverTexture=makeTexture(true);
 const target=new THREE.Mesh(new THREE.PlaneGeometry(1.5,3.8),new THREE.MeshBasicMaterial({map:idleTexture,transparent:true,opacity:doorwayIdleOpacity,depthWrite:false,toneMapped:false})) as DoorwayTarget;
 target.setHovered=hovered=>{target.material.map=hovered?hoverTexture:idleTexture;target.material.opacity=hovered?doorwayHoverOpacity:doorwayIdleOpacity;};
 target.name='doorway-direction-arrow';target.userData={kind:'doorway',from:room.id,to:next.id};target.rotation.x=-Math.PI/2;guide.add(target);
 return guide;
}
