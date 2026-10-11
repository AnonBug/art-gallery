import * as THREE from 'three';

interface FrameStyle {borderRatio:number;minBorder:number;maxBorder:number}

/** Shared local materials and instanced carving keep the gilded frames inexpensive. */
export class OrnateFrames {
 private molding:THREE.MeshStandardMaterial;
 private gold:THREE.MeshStandardMaterial;
 private leaf:THREE.MeshStandardMaterial;
 private beadGeometry=new THREE.SphereGeometry(1,8,6);
 private leafGeometry=this.carvedLeaf();
 private fluteGeometry=this.flutedRidge();
 constructor(private style:FrameStyle,anisotropy:number){
  const {color,relief,surface}=this.ribbonTextures();
  const patina=this.patinaTextures();
  for(const texture of [color,relief,surface,patina.color,patina.relief,patina.surface])texture.anisotropy=Math.min(4,anisotropy);
  this.molding=new THREE.MeshStandardMaterial({map:color,bumpMap:relief,bumpScale:.004,roughnessMap:surface,metalnessMap:surface,vertexColors:true,metalness:1,roughness:1});
  const ornament={map:patina.color,bumpMap:patina.relief,bumpScale:.002,metalnessMap:patina.surface,roughnessMap:patina.surface,metalness:1,roughness:1};
  this.gold=new THREE.MeshStandardMaterial({...ornament,color:0xc8b58f});
  this.leaf=new THREE.MeshStandardMaterial({...ornament,color:0xb4a17b,side:THREE.DoubleSide});
 }
 create(width:number,height:number){
  const border=THREE.MathUtils.clamp(Math.min(width,height)*this.style.borderRatio,this.style.minBorder,this.style.maxBorder);
  const group=new THREE.Group();group.name='antique-walnut-gilded-frame';
  const mesh=new THREE.Mesh(this.profile(width,height,border),this.molding);group.add(mesh);
  const leaves:THREE.Matrix4[]=[],beads:THREE.Matrix4[]=[],flutes:THREE.Matrix4[]=[];
  const dummy=new THREE.Object3D();
  const place=(list:THREE.Matrix4[],x:number,y:number,z:number,angle:number,sx:number,sy:number,sz:number)=>{
   dummy.position.set(x,y,z);dummy.rotation.set(0,0,angle);dummy.scale.set(sx,sy,sz);dummy.updateMatrix();list.push(dummy.matrix.clone());
  };
  // The broad outer frieze has paired acanthus leaves and little seed pearls.
  const sides=[{length:width,x:0,y:height/2,angle:0},{length:height,x:-width/2,y:0,angle:Math.PI/2},
   {length:width,x:0,y:-height/2,angle:Math.PI},{length:height,x:width/2,y:0,angle:-Math.PI/2}];
  for(const side of sides){
   const along=new THREE.Vector2(Math.cos(side.angle),Math.sin(side.angle));
   const outward=new THREE.Vector2(-along.y,along.x);
   const point=(t:number,r:number)=>new THREE.Vector2(side.x,side.y).addScaledVector(along,t).addScaledVector(outward,r*border);
   const fluteCount=Math.floor(side.length/.016);
   for(let i=0;i<fluteCount;i++){
    const p=point(-side.length/2+(i+.5)*side.length/fluteCount,0);
    place(flutes,p.x,p.y,.06,side.angle,border,border,border);
   }
   const count=Math.max(4,Math.floor(side.length/(border*.7)));
   for(let i=0;i<count;i++){
    const p=point((i+.5)*side.length/count-side.length/2,.66);
    for(const sign of [-1,1])place(leaves,p.x,p.y,.06+border*.76,side.angle+sign*.56,border*.60,border*.105,border*.55);
    place(beads,p.x,p.y,.06+border*.79,0,border*.035,border*.035,border*.025);
   }
   const pearlCount=Math.ceil((side.length+border*.1)/.038);
   for(let i=0;i<pearlCount;i++){
    const p=point(-side.length/2+(i+.5)*side.length/pearlCount,.105);
    place(beads,p.x,p.y,.06+border*.47,0,.010,.010,.007);
   }
  }
  // Small corner rosettes join the mitred floral band without covering the painting.
  for(const xSign of [-1,1])for(const ySign of [-1,1]){
   const x=xSign*(width/2+border*.66),y=ySign*(height/2+border*.66);
   for(let petal=0;petal<8;petal++)place(leaves,x,y,.06+border*.77,petal*Math.PI/4,border*.36,border*.095,border*.55);
   place(beads,x,y,.06+border*.84,0,border*.065,border*.065,border*.045);
  }
  for(const [geometry,material,matrices] of [[this.leafGeometry,this.leaf,leaves],[this.beadGeometry,this.gold,beads],[this.fluteGeometry,this.molding,flutes]] as const){
   const instances=new THREE.InstancedMesh(geometry,material,matrices.length);
   matrices.forEach((matrix,i)=>{
    instances.setMatrixAt(i,matrix);
    const shade=.77+.23*((i*37%97)/96);
    instances.setColorAt(i,new THREE.Color().setRGB(shade,shade*.99,shade*.96));
   });instances.computeBoundingSphere();group.add(instances);
  }
  return {group,border,hitMesh:mesh};
 }
 private profile(width:number,height:number,border:number){
  // Radius, depth and gold tone: a carved scoop between several raised fillets.
  const profile:[number,number,string][]=[
   [0,.17,'#55483a'],[.025,.32,'#f0e5cc'],[.06,.38,'#b5a48a'],[.105,.43,'#d5c8ad'],
   [.14,.30,'#766854'],[.18,.23,'#b7a38e'],[.25,.27,'#d1bc9f'],[.34,.38,'#d3bfa6'],
   [.42,.58,'#d9c7aa'],[.46,.68,'#e5d8bb'],[.49,.51,'#69533e'],[.53,.68,'#bbab8d'],
   [.78,.76,'#cabb9d'],[.81,.60,'#76624c'],[.85,.82,'#ddcfaf'],[.90,.91,'#ede1c3'],
   [.95,.77,'#a19077'],[1,.64,'#9f8772'],[1,-.24,'#685344']];
  const positions:number[]=[],colors:number[]=[],uvs:number[]=[],indices:number[]=[];
  const corners=(radius:number,z:number)=>[[-width/2-radius,-height/2-radius,z],[width/2+radius,-height/2-radius,z],
   [width/2+radius,height/2+radius,z],[-width/2-radius,height/2+radius,z]];
  for(let p=0;p<profile.length-1;p++){
   const [r0,d0,c0]=profile[p],[r1,d1,c1]=profile[p+1];
   const inner=corners(r0*border,.06+d0*border),outer=corners(r1*border,.06+d1*border);
   for(let side=0;side<4;side++){
    const next=(side+1)%4,start=positions.length/3,length=side%2?height:width;
    const vertices=[inner[side],outer[side],outer[next],inner[next]];
    vertices.forEach((v,i)=>{positions.push(...v);const color=new THREE.Color(i===0||i===3?c0:c1);colors.push(color.r,color.g,color.b);
     uvs.push((i<2?0:length)/.85,i===0||i===3?r0:r1);});
    indices.push(start,start+1,start+2,start,start+2,start+3);
   }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
 }
 private carvedLeaf(){
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[];
  for(let i=0;i<=8;i++){
   const t=i/8,x=t,halfWidth=Math.sin(t*Math.PI)*(.8+.2*Math.cos(t*Math.PI*6));
   const curl=Math.sin(t*Math.PI)*.14;
   positions.push(x,curl-halfWidth,.025*Math.sin(t*Math.PI),x,curl,.20*Math.sin(t*Math.PI),x,curl+halfWidth,.025*Math.sin(t*Math.PI));
   uvs.push(t,0,t,.5,t,1);
  }
  for(let i=0;i<8;i++)for(let j=0;j<2;j++){const k=i*3+j;indices.push(k,k+3,k+1,k+1,k+3,k+4);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
 }
 private flutedRidge(){
  const positions:number[]=[],indices:number[]=[],uvs:number[]=[];
  for(const [radius,depth]of [[.18,.23],[.25,.27],[.34,.38],[.42,.58]]){
   positions.push(-.009,radius,depth+.004,0,radius,depth+.025,.009,radius,depth+.004);
   uvs.push(0,radius,.01,radius,.02,radius);
  }
  for(let i=0;i<3;i++)for(let j=0;j<2;j++){const k=i*3+j;indices.push(k,k+1,k+3,k+1,k+4,k+3);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
 }
 private ribbonTextures(){
  const w=1024,h=512;
  const canvases=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
  const contexts=canvases.map(c=>c.getContext('2d')!);
  const images=contexts.map(c=>c.createImageData(w,h));
  let seed=29;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  // Walnut scoop/outer edge and aged gilded rails. Grain follows each mitred side.
  // Linear surface maps: green=roughness, blue=metalness; only color is sRGB.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const r=1-y/(h-1),u=x/w,tau=Math.PI*2;
   const warp=Math.sin(u*tau*2)*.017+Math.sin(u*tau*5+r*6)*.004;
   const grain=Math.sin((r+warp)*690+Math.sin(u*tau*3)*2);
   const pores=Math.pow(Math.max(0,Math.sin((r+warp)*1170+Math.sin(u*tau)*3)),14);
   const cloud=(Math.sin(u*tau*3+r*17)+Math.cos(u*tau*7-r*39)+Math.sin(u*tau+r*93))/3;
   const noise=random(),wood=r>.15&&r<.425||r>.955;
   const recess=Math.exp(-Math.pow((r-.49)/.022,2))+Math.exp(-Math.pow((r-.81)/.016,2));
   const shade=wood? .93+grain*.07-pores*.12+cloud*.10+(noise-.5)*.055 : .89+cloud*.10+(noise-.5)*.07-recess*.32;
   const base=wood?[104,69,43]:[194,167,117];
   const i=(y*w+x)*4;
   for(let k=0;k<3;k++)images[0].data[i+k]=base[k]*shade;
   images[0].data[i+3]=255;
   const height=wood?128+grain*12-pores*19:128+cloud*8+(noise-.5)*17;
   images[1].data.set([height,height,height,255],i);
   const rough=wood? .73+pores*.09:.51-cloud*.08+recess*.17;
   const metal=wood?.015:.57-recess*.20;
   images[2].data.set([0,rough*255,metal*255,255],i);
  }
  contexts.forEach((ctx,i)=>ctx.putImageData(images[i],0,0));
  const [color,relief,surface]=contexts;
  // Small irregular losses reveal dark wood and red-brown bole beneath gold leaf.
  for(let i=0;i<230;i++){
   const x=random()*w,r=random(),y=(1-r)*h;
   if(r>.15&&r<.425||r>.955)continue;
   const length=1+Math.pow(random(),3)*16;
   color.fillStyle=i%4?'rgba(76,49,31,.24)':'rgba(113,62,39,.32)';
   color.fillRect(x,y,length,.5+random()*1.3);
   relief.fillStyle='#676767';relief.fillRect(x,y,length,1);
   surface.fillStyle='rgb(0,200,25)';surface.fillRect(x,y,length,1);
  }
  return this.canvasTextures(canvases);
 }
 private patinaTextures(){
  const w=256;
  const canvases=Array.from({length:3},()=>{const c=document.createElement('canvas');c.width=c.height=w;return c;});
  const contexts=canvases.map(c=>c.getContext('2d')!);
  const images=contexts.map(c=>c.createImageData(w,w));
  let seed=89;const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let y=0;y<w;y++)for(let x=0;x<w;x++){
   const u=x/w*Math.PI*2,v=y/w*Math.PI*2;
   const cloud=(Math.sin(u*3+Math.sin(v*2))*Math.cos(v*3)+Math.sin(u*7-v*5)*.35)/1.35;
   const shade=.86+cloud*.16+(random()-.5)*.08;
   const i=(y*w+x)*4;
   images[0].data.set([190*shade,158*shade,106*shade,255],i);
   const height=128+cloud*14+(random()-.5)*22;
   images[1].data.set([height,height,height,255],i);
   images[2].data.set([0,(.55-cloud*.12)*255,(.54+cloud*.08)*255,255],i);
  }
  contexts.forEach((ctx,i)=>ctx.putImageData(images[i],0,0));
  return this.canvasTextures(canvases);
 }
 private canvasTextures(canvases:HTMLCanvasElement[]){
  const [color,relief,surface]=canvases.map(c=>new THREE.CanvasTexture(c));
  color.colorSpace=THREE.SRGBColorSpace;
  for(const texture of [color,relief,surface]){texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;}
  return {color,relief,surface};
 }
}
