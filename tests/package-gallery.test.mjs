import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {packageGallery} from '../scripts/package-gallery.mjs';

test('发布包按真实资源路径保留版本化画源、完整DZI、雕塑及解码器，剔除储备和重复整图',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'gallery-package-'));
 const files=['assets/artworks/current/metadata.json','assets/artworks/current-v2/far.webp','assets/artworks/current/detail.webp','assets/artworks/current-v2/detail.dzi','assets/artworks/current-v2/detail_files/0/0_0.jpg','assets/artworks/current-v2/detail_files/15/1_2.jpg','assets/artworks/current/original.dzi','assets/artworks/current/original_files/16/2_3.jpg','assets/artworks/current/.DS_Store','assets/artworks/reserve/detail.webp','assets/sculptures/model.glb','assets/draco/decoder.wasm','index.html'];
 const artwork={id:'current',variants:[{url:'/assets/artworks/current-v2/far.webp'}],detail:{url:'/assets/artworks/current/detail.webp',dzi:'/assets/artworks/current-v2/detail.dzi'},hasOriginal:true,original:{dzi:'/assets/artworks/current/original.dzi'}};
 try{
  for(const file of files){const target=path.join(root,'dist',file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'data');}
  await fs.mkdir(path.join(root,'public'));await fs.writeFile(path.join(root,'public','original.jpg'),'source');
  const report=await packageGallery(path.join(root,'dist'),[artwork]);assert.equal(report.artworks,1);assert.ok(report.bytes>0);
  for(const file of files){const target=path.join(root,'dist',file);if(file.includes('/reserve/')||file.endsWith('detail.webp')||file.includes('/original')||file.endsWith('.DS_Store'))await assert.rejects(fs.access(target));else await fs.access(target);}
  assert.equal(await fs.readFile(path.join(root,'public','original.jpg'),'utf8'),'source');
  await assert.rejects(packageGallery(path.join(root,'dist'),[artwork],{maxBytes:1}),/Pages budget/);
  await fs.unlink(path.join(root,'dist/assets/artworks/current-v2/far.webp'));
  await assert.rejects(packageGallery(path.join(root,'dist'),[artwork]),/ENOENT/,'缺失在展资源不能静默部署');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
