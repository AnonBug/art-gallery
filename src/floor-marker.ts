import * as THREE from 'three';

let texture:THREE.CanvasTexture|undefined;
/** A small pool of light on the parquet, shared by the aim and destination markers. */
export class FloorMarker extends THREE.Group {
 private material:THREE.MeshBasicMaterial;
 private disc:THREE.Mesh;
 constructor(private destination=false) {
  super();texture??=makeTexture();
  this.material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,color:destination?0xffecc5:0xffdf9e});
  this.disc=new THREE.Mesh(new THREE.PlaneGeometry(.82,.82),this.material);
  this.disc.rotation.x=-Math.PI/2;this.disc.renderOrder=2;this.add(this.disc);this.visible=false;
 }
 show(point:THREE.Vector3) {this.position.set(point.x,this.destination ? .016 : .012,point.z);this.visible=true;}
 hide() {this.visible=false;}
 animate(time:number) {
  if(!this.visible)return;
  this.disc.scale.setScalar(1+.035*Math.sin(time*.003));
  this.material.opacity=(this.destination ? .84 : .67)+.09*Math.sin(time*.003);
 }
}

function makeTexture() {
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;
 const glow=ctx.createRadialGradient(128,128,32,128,128,123);
 glow.addColorStop(0,'rgba(255,255,255,.025)');glow.addColorStop(.55,'rgba(255,255,255,.12)');glow.addColorStop(.78,'rgba(255,255,255,.22)');glow.addColorStop(1,'rgba(255,255,255,0)');
 ctx.fillStyle=glow;ctx.fillRect(0,0,256,256);
 ctx.strokeStyle='rgba(255,255,255,.95)';ctx.lineWidth=2.5;ctx.shadowColor='white';ctx.shadowBlur=9;
 ctx.beginPath();ctx.arc(128,128,89,0,Math.PI*2);ctx.stroke();
 ctx.shadowBlur=5;ctx.fillStyle='rgba(255,255,255,.85)';ctx.beginPath();ctx.arc(128,128,3,0,Math.PI*2);ctx.fill();
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
