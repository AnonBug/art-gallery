import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const artworks=JSON.parse(await fs.readFile('src/data/artworks.json','utf8'));
const errors=[],report=[],urls=new Set(['/','/favicon.svg']);let tiles=0;
const checked=new Set();
for(const a of artworks){
 const row={id:a.id,title:a.title,display:[],detail:{},original:{}};
 for(const [i,v]of a.variants.entries()){
  urls.add(v.url);const file=path.join('public',v.url);try{const size=(await fs.stat(file)).size;const m=await sharp(file).metadata();if(size>3_000_000)errors.push(`${a.id} 展示图超过3MB`);if(m.width!==v.width||m.height!==v.height)errors.push(`${a.id} 展示尺寸不匹配`);row.display.push({width:m.width,height:m.height,bytes:size,path:v.url});}catch(e){errors.push(`${file}: ${e.message}`);}
 }
 try{urls.add(a.detail.url);const file=path.join('public',a.detail.url);const m=await sharp(file).metadata();const size=(await fs.stat(file)).size;row.detail={width:m.width,height:m.height,bytes:size};if(size>20_000_000)errors.push(`${a.id} 细看超过20MB`);if(m.width!==a.detail.width||m.height!==a.detail.height)errors.push(`${a.id} 细看尺寸不匹配`);}catch(e){errors.push(e.message);}
 for(const asset of [a.detail,...(a.hasOriginal?[a.original]:[])]){
  if(checked.has(asset.dzi))continue;checked.add(asset.dzi);urls.add(asset.dzi);const file=path.join('public',asset.dzi);
  try{
   const xml=await fs.readFile(file,'utf8');const attr=name=>Number(xml.match(new RegExp(`${name}="(\\d+)"`))?.[1]);
   const w=attr('Width'),h=attr('Height'),tile=attr('TileSize'),overlap=attr('Overlap');const ext=xml.match(/Format="(\w+)"/)?.[1];
   if(w!==asset.width||h!==asset.height)errors.push(`${file} DZI尺寸不匹配`);
   const maxLevel=Math.ceil(Math.log2(Math.max(w,h)));let count=0;
   for(let level=0;level<=maxLevel;level++){const scale=2**(maxLevel-level),lw=Math.ceil(w/scale),lh=Math.ceil(h/scale);for(let x=0;x<Math.ceil(lw/tile);x++)for(let y=0;y<Math.ceil(lh/tile);y++){
    const tilePath=file.replace(/\.dzi$/,'_files')+`/${level}/${x}_${y}.${ext}`;urls.add('/'+tilePath.slice(7));const stat=await fs.stat(tilePath);if(!stat.size)errors.push(`${tilePath} 空瓦片`);count++;
   }}
   // Decode the last, edge tile to catch truncated images and overlap mistakes.
   const x=Math.ceil(w/tile)-1,y=Math.ceil(h/tile)-1;
   const edge=await sharp(file.replace(/\.dzi$/,'_files')+`/${maxLevel}/${x}_${y}.${ext}`).metadata();
   const ew=w-x*tile+(x?overlap:0),eh=h-y*tile+(y?overlap:0);
   if(edge.width!==ew||edge.height!==eh)errors.push(`${file} 边缘瓦片尺寸异常 ${edge.width}x${edge.height} expected ${ew}x${eh}`);
   tiles+=count;if(asset===a.original)row.original={width:w,height:h,tiles:count};else row.detail={...row.detail,tiles:count};
  }catch(e){errors.push(`${file}: ${e.message}`);}
 }
 report.push(row);
}
const httpIndex=process.argv.indexOf('--http');let httpChecks=0;
if(httpIndex>=0){const base=process.argv[httpIndex+1];const pending=[...urls];await Promise.all(Array.from({length:16},async()=>{while(pending.length){const url=pending.pop();try{const response=await fetch(new URL(url,base),{method:'HEAD',signal:AbortSignal.timeout(10000)});if(!response.ok)errors.push('HTTP '+response.status+' '+url);httpChecks++;}catch(e){errors.push('HTTP '+url+': '+e.message);}}}));}
const result={httpChecks,checkedAt:new Date().toISOString(),artworks:report.length,dzi:checked.size,tiles,errors,resources:report};
await fs.mkdir('docs',{recursive:true});await fs.writeFile('docs/resource-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({artworks:report.length,dzi:checked.size,tiles,httpChecks,errors},null,2));if(errors.length)process.exitCode=1;
