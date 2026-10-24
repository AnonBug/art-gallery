#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
// Usage: npm run images -- originals/my-painting.jpg my-painting [metadata.json]
const [input,id,metadataPath]=process.argv.slice(2);
if(!input||!id||!/^[-a-z0-9]+$/.test(id)){console.error('用法：npm run images -- <原始图片> <英文id> [作品信息.json]');process.exit(1);}
const source=path.resolve(input),dest=path.resolve('public/assets/artworks',id);
if(source.startsWith(dest+path.sep))throw new Error('原始文件必须位于输出目录之外，避免覆盖。');
await fs.access(source);await fs.mkdir(path.dirname(dest),{recursive:true});
const staging=await fs.mkdtemp(path.join(path.dirname(dest),`.${id}-`));
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'manlan-image-'));
sharp.cache({memory:64,files:20,items:30});sharp.concurrency(2);
const prefix=`/assets/artworks/${id}`;
try{
 const meta=metadataPath?JSON.parse(await fs.readFile(metadataPath,'utf8')):{};
 delete meta.original;delete meta.hasOriginal;
 // Auto-orient first. A disk-backed, tiled TIFF preserves the oriented master losslessly.
 const master=path.join(scratch,'oriented.tif');
 console.log('应用 EXIF 方向并保存临时无损母版…');
 await sharp(source,{limitInputPixels:false,sequentialRead:true}).rotate().tiff({compression:'lzw',tile:true,pyramid:false}).toFile(master);
 const dimensions=await sharp(master,{limitInputPixels:false}).metadata();
 const width=dimensions.width,height=dimensions.height;
 async function boundedWebp(name,maxEdge,limit){
  // WebP has a 16383px side limit. Generate only the bounded detail image and its DZI.
  let edge=Math.min(maxEdge,16383,Math.max(width,height));
  for(let attempt=0;attempt<20;attempt++){
   for(const quality of [94,90,86,82]){
    const output=path.join(staging,`${name}.webp`);
    const info=await sharp(master,{limitInputPixels:false,sequentialRead:true}).resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality,effort:5}).toFile(output);
    if(info.size<=limit)return {url:`${prefix}/${name}.webp`,width:info.width,height:info.height,bytes:info.size,quality};
   }
   edge=Math.max(1,Math.floor(edge*.86));
  }
  throw new Error(`${name} 未能满足文件体积限制`);
 }
 const variants=[];for(const [name,edge] of [['far',640],['medium',1600],['near',3000]])variants.push(await boundedWebp(name,edge,3_000_000));
 // Start at native resolution, lower encoding quality before reducing pixel dimensions.
 const detail=await boundedWebp('detail',Math.max(width,height),20_000_000);
 async function pyramid(image,name){
  console.log(`生成 ${name} DZI…`);
  await sharp(image,{limitInputPixels:false,sequentialRead:true}).jpeg({quality:92,chromaSubsampling:'4:4:4'}).tile({size:512,overlap:1,layout:'dz',depth:'onepixel'}).toFile(path.join(staging,name));
  return `${prefix}/${name}.dzi`;
 }
 detail.dzi=await pyramid(path.join(staging,'detail.webp'),'detail');
 const manifest={id,title:'作品名称待确认',originalTitle:'待确认',date:'待确认',author:'待确认',source:'待确认',license:'待确认',credit:'待确认',description:'待补充',looking:'待补充',dimensions:'待确认',medium:'待确认',...meta,id,sourceWidth:width,sourceHeight:height,originalFile:path.relative(process.cwd(),source),originalFileBytes:(await fs.stat(source)).size,variants,detail,generatedAt:new Date().toISOString()};
 await fs.writeFile(path.join(staging,'metadata.json'),JSON.stringify(manifest,null,2)+'\n');
 // Keep prior generated output recoverable; never touch the user-supplied input.
 try{await fs.access(dest);const backup=path.resolve('originals/generated-backups',`${id}-${Date.now()}`);await fs.mkdir(path.dirname(backup),{recursive:true});await fs.rename(dest,backup);console.log(`旧输出保留于 ${backup}`);}catch(error){if(error.code!=='ENOENT')throw error;}
 await fs.rename(staging,dest);console.log(JSON.stringify(manifest,null,2));
}finally{await fs.rm(scratch,{recursive:true,force:true});await fs.rm(staging,{recursive:true,force:true});}
