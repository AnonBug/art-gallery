import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assetPath,artworkWithBase} from '../src/asset-path.mjs';

test('根目录与Pages子目录下所有作品图片、DZI及其相对瓦片地址保持正确',async()=>{
 const artworks=JSON.parse(await fs.readFile(new URL('../src/data/artworks.json',import.meta.url),'utf8'));
 for(const base of ['/','/art-gallery/'])for(const artwork of artworks){
  const resolved=artworkWithBase(artwork,base);
  assert.equal(resolved.id,artwork.id);
  for(const [original,asset]of [...artwork.variants.map((v,i)=>[v,resolved.variants[i]]),[artwork.detail,resolved.detail]]){
   for(const key of ['url','dzi'])if(original[key])assert.equal(asset[key],base+original[key].slice(1));
  }
  const tile=new URL(resolved.detail.dzi.replace(/\.dzi$/,'_files/12/0_0.jpg'),'https://example.com');
  assert.ok(tile.pathname.startsWith(base+'assets/artworks/'));
  assert.equal(artwork.detail.dzi.startsWith('/assets/'),true,'不修改原始配置');
 }
});
test('保留外链、协议相对地址及空值',()=>{
 for(const url of [undefined,'https://example.com/image.jpg','//example.com/image.jpg','data:image/png;base64,abc'])assert.equal(assetPath(url,'/art-gallery/'),url);
});
