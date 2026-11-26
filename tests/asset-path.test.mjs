import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {assetPath,artworkWithBase,DEFAULT_ASSET_BASE_URL} from '../src/asset-path.mjs';

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

test('默认从OSS版本目录读取所有画作及相对瓦片，允许替换资源源站',async()=>{
 const artworks=JSON.parse(await fs.readFile(new URL('../src/data/artworks.json',import.meta.url),'utf8'));
 for(const artwork of artworks){
  const resolved=artworkWithBase(artwork);
  for(const variant of resolved.variants)assert.ok(variant.url.startsWith(DEFAULT_ASSET_BASE_URL+'assets/artworks/'));
  assert.equal(resolved.detail.dzi,DEFAULT_ASSET_BASE_URL+artwork.detail.dzi.slice(1));
  const tile=new URL(resolved.detail.dzi.replace(/\.dzi$/,'_files/0/0_0.jpg'));
  assert.equal(tile.origin,new URL(DEFAULT_ASSET_BASE_URL).origin);
  assert.ok(tile.pathname.startsWith(new URL(DEFAULT_ASSET_BASE_URL).pathname+'assets/artworks/'));
 }
 for(const base of ['https://cdn.example.com/releases/v2','https://cdn.example.com/releases/v2/']){
  assert.equal(assetPath('/assets/draco/',base),'https://cdn.example.com/releases/v2/assets/draco/');
 }
 assert.equal(assetPath('/assets/sculptures/nefertiti/model.glb','/__gallery_assets/'),'/__gallery_assets/assets/sculptures/nefertiti/model.glb');
});
