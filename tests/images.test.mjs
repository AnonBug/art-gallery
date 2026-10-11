import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import sharp from 'sharp';
test('图片脚本处理EXIF方向，生成有效DZI，重复执行保留原文件与旧输出',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'manlan-pipeline-'));
 try{
  const original=path.join(tmp,'input.jpg');await sharp({create:{width:777,height:1025,channels:3,background:'#8b6642'}}).jpeg().withMetadata({orientation:6}).toFile(original);
  const hash=async()=>crypto.createHash('sha256').update(await fs.readFile(original)).digest('hex');const before=await hash();
  for(let i=0;i<2;i++){const result=spawnSync(process.execPath,[path.resolve('scripts/process-images.mjs'),original,'fixture'],{cwd:tmp,encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);}
  const dir=path.join(tmp,'public/assets/artworks/fixture'),manifest=JSON.parse(await fs.readFile(path.join(dir,'metadata.json')));
  assert.equal(manifest.sourceWidth,1025);assert.equal(manifest.sourceHeight,777);assert.equal(await hash(),before);
  assert.ok(manifest.variants.every(v=>v.bytes<3_000_000));assert.ok(manifest.detail.bytes<20_000_000);
  const dzi=await fs.readFile(path.join(dir,'detail.dzi'),'utf8');assert.match(dzi,/Width="1025"/);assert.match(dzi,/TileSize="512"/);
  await sharp(path.join(dir,'detail_files/11/0_0.jpeg')).metadata().catch(async()=>{await sharp(path.join(dir,'detail_files/11/0_0.jpg')).metadata();});
  assert.equal((await fs.readdir(path.join(tmp,'originals/generated-backups'))).length,1);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
test('超过WebP单边上限的输入仍保留完整原画DZI',async()=>{
 const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'manlan-large-side-'));
 try{
  const original=path.join(tmp,'large.png');await sharp({create:{width:17,height:17000,channels:3,background:'#664a33'}}).png().toFile(original);
  const result=spawnSync(process.execPath,[path.resolve('scripts/process-images.mjs'),original,'large'],{cwd:tmp,encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);
  const dir=path.join(tmp,'public/assets/artworks/large'),m=JSON.parse(await fs.readFile(path.join(dir,'metadata.json')));
  assert.ok(m.detail.height<=16383);assert.equal(m.hasOriginal,true);assert.equal(m.original.height,17000);assert.equal(m.original.width,17);
  assert.match(await fs.readFile(path.join(dir,'original.dzi'),'utf8'),/Height="17000"/);
 }finally{await fs.rm(tmp,{recursive:true,force:true});}
});
