import * as THREE from 'three';
import type { Artwork } from './types';

const WIDTH=.78, HEIGHT=WIDTH*554/1024, THICKNESS=.008;
const SANS='"PingFang SC", "Microsoft YaHei", sans-serif';
const SERIF='"Songti SC", "STSong", "Noto Serif CJK SC", "SimSun", serif';
let shadowTexture:THREE.CanvasTexture|undefined;

/** A thin ivory museum card. Chinese titles use upright Song type rather than faux italics. */
export function createArtworkLabel(artwork:Artwork,anisotropy:number) {
 const group=new THREE.Group();group.name=`artwork-label-${artwork.id}`;
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=554;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 texture.anisotropy=Math.min(8,anisotropy);
 const draw=()=>{drawCard(canvas,artwork);texture.needsUpdate=true;};
 draw();
 // Canvas text does not repaint when fonts become available; refresh the face after font loading.
 if(document.fonts)void Promise.all([
  document.fonts.load(`600 68px ${SERIF}`,artwork.title),
  document.fonts.load(`500 44px ${SANS}`,artwork.author),
 ]).then(draw).catch(()=>{});

 const edge=new THREE.Mesh(new THREE.BoxGeometry(WIDTH,HEIGHT,THICKNESS),new THREE.MeshStandardMaterial({color:0xd8cdb7,roughness:.88}));
 group.add(edge);
 const face=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH,HEIGHT),new THREE.MeshStandardMaterial({map:texture,roughness:.92}));
 face.position.z=THICKNESS/2+.0005;face.userData={id:artwork.id,kind:'label'};group.add(face);
 shadowTexture??=makeShadow();
 const shadow=new THREE.Mesh(new THREE.PlaneGeometry(WIDTH+.06,HEIGHT+.055),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false}));
 shadow.position.set(.006,-.008,-.010);shadow.renderOrder=1;group.add(shadow);
 return {group,hitMesh:face,width:WIDTH,height:HEIGHT};
}

function drawCard(canvas:HTMLCanvasElement,artwork:Artwork) {
 const ctx=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,pad=72,available=w-pad*2;
 const paper=ctx.createLinearGradient(0,0,0,h);paper.addColorStop(0,'#f7f1e4');paper.addColorStop(1,'#eee5d2');
 ctx.fillStyle=paper;ctx.fillRect(0,0,w,h);
 // Only the card's edge is ruled, leaving the face free of an ornamental inset frame.
 ctx.strokeStyle='rgba(112,94,62,.3)';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
 ctx.textBaseline='top';ctx.textAlign='left';
 let titleSize=68,titleLines:string[];
 do {ctx.font=`600 ${titleSize}px ${SERIF}`;titleLines=wrap(ctx,artwork.title,available);if(titleLines.length<=2)break;titleSize-=2;}while(titleSize>36);
 const titleHeight=titleSize*1.18;
 const block=52+20+2+32+titleLines.length*titleHeight+22+54+4+44;
 let y=(h-block)/2;
 ctx.fillStyle='#4b4234';
 let authorSize=44,spacing=6;
 do {ctx.font=`500 ${authorSize}px ${SANS}`;if(trackedWidth(ctx,artwork.author,spacing)<=available)break;authorSize-=1;spacing=Math.max(2,spacing-.15);}while(authorSize>24);
 trackedText(ctx,artwork.author,pad,y,spacing);
 y+=72;
 const gold=ctx.createLinearGradient(pad,0,w-pad,0);gold.addColorStop(0,'rgba(159,123,53,.85)');gold.addColorStop(1,'rgba(159,123,53,.14)');
 ctx.fillStyle=gold;ctx.fillRect(pad,y,available,2);
 y+=34;ctx.font=`600 ${titleSize}px ${SERIF}`;ctx.fillStyle='#29231b';
 for(const line of titleLines){ctx.fillText(line,pad,y);y+=titleHeight;}
 y+=22;ctx.font=`400 48px ${SANS}`;ctx.fillStyle='#514636';trackedText(ctx,artwork.date,pad,y,2);
 y+=58;ctx.font=`400 36px ${SANS}`;ctx.fillStyle='#6d604d';ctx.fillText(artwork.dimensions,pad,y);
}

// Wrap by Unicode character so Chinese titles remain readable without horizontal compression.
function wrap(ctx:CanvasRenderingContext2D,text:string,width:number) {
 const lines:string[]=[];let line='';
 for(const char of text) {
  if(line&&ctx.measureText(line+char).width>width){lines.push(line);line=char;}else line+=char;
 }
 if(line)lines.push(line);return lines;
}
function trackedWidth(ctx:CanvasRenderingContext2D,text:string,spacing:number) {
 return Array.from(text).reduce((width,char)=>width+ctx.measureText(char).width,0)+Math.max(0,Array.from(text).length-1)*spacing;
}
function trackedText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,spacing:number) {
 for(const char of text){ctx.fillText(char,x,y);x+=ctx.measureText(char).width+spacing;}
}
function makeShadow() {
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=160;
 const ctx=canvas.getContext('2d')!;ctx.shadowColor='rgba(15,12,7,.4)';ctx.shadowBlur=9;ctx.shadowOffsetY=4;
 ctx.fillStyle='rgba(15,12,7,.3)';ctx.fillRect(13,12,230,132);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
