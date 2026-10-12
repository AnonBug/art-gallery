import * as THREE from 'three';

/** One reused, unlit outline: feedback without extra lights or post-processing. */
export class HoverHighlight extends THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial> {
 private target:THREE.Object3D|null=null;
 private amount=0;
 constructor(private reducedMotion=false){
  super(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xffdf9e,transparent:true,opacity:0,depthWrite:false,toneMapped:false}));
  this.geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(24),3));
  this.geometry.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);
  this.name='clickable-hover-highlight';this.visible=false;this.renderOrder=3;
 }
 show(target:THREE.Object3D,width:number,height:number,depth:number){
  if(this.target===target)return;
  this.target=target;this.amount=0;
  const line=Math.min(.016,height*.018),gap=line*1.8;
  const x=width/2+gap,y=height/2+gap;
  const positions=this.geometry.getAttribute('position');
  positions.array.set([-x,-y,0,x,-y,0,x,y,0,-x,y,0,-x-line,-y-line,0,x+line,-y-line,0,x+line,y+line,0,-x-line,y+line,0]);positions.needsUpdate=true;
  this.geometry.computeBoundingSphere();
  target.updateWorldMatrix(true,false);
  this.position.copy(target.localToWorld(new THREE.Vector3(0,0,depth)));target.getWorldQuaternion(this.quaternion);
  this.visible=true;
 }
 dismiss(immediate=false){this.target=null;if(immediate){this.amount=0;this.material.opacity=0;this.visible=false;}}
 animate(dt:number,time:number){
  if(!this.visible)return;
  this.amount=this.reducedMotion?(this.target?1:0):THREE.MathUtils.damp(this.amount,this.target?1:0,14,dt);
  if(this.amount<.005&&!this.target){this.visible=false;return;}
  this.material.opacity=this.amount*(this.reducedMotion?.78:.73+.08*Math.sin(time*.003));
 }
}
