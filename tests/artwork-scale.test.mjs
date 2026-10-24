import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {withPhysicalSize,artworkFrameBorder,defaultArtworkCenter} from '../src/artwork-scale.mjs';

const raw=JSON.parse(await fs.readFile(new URL('../src/data/artworks.json',import.meta.url),'utf8'));
test('27件作品按有来源的原作尺寸与展示倍率生成米制宽高，像素尺寸和旧height不改变实体尺寸',()=>{
 assert.equal(raw.length,27);
 for(const a of raw){
  const sized=withPhysicalSize(a);
  const scale=a.displayScale??1;
  assert.equal(sized.height,a.physicalSize.heightCm/100*scale);assert.equal(sized.width,a.physicalSize.widthCm/100*scale);
  assert.match(a.physicalSize.source,/^https:\/\//);assert.match(a.physicalSize.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
  const changed=withPhysicalSize({...a,height:99,width:99,sourceWidth:1,sourceHeight:100});
  assert.equal(changed.height,sized.height);assert.equal(changed.width,sized.width);
  assert.ok(a.centerY-sized.height/2-artworkFrameBorder(sized.width,sized.height)>1.02,'画框不被护墙线遮挡');
 }
 const mona=withPhysicalSize(raw.find(a=>a.id==='leonardo-mona-lisa'));
 assert.equal(mona.height,1.588);assert.equal(mona.width,1.068);
 const prodigal=withPhysicalSize(raw.find(a=>a.id==='prodigal'));
 assert.equal(prodigal.height,5.24);assert.equal(prodigal.width,4.1);
});
test('第二厅保留冬宫四幅市场画；最后的晚餐原大，其余26件作品宽高各放大两倍',()=>{
 const market=raw.filter(a=>a.room==='market');
 assert.deepEqual(market.map(a=>a.id).sort(),['snyders-fish','snyders-fruit','snyders-game','snyders-vegetable']);
 assert.ok(market.every(a=>a.collection==='冬宫博物馆'&&a.displayScale===2));
 assert.deepEqual(market.filter(a=>a.wall==='north').map(a=>a.offset).sort((a,b)=>a-b),[-5.5,5.5]);
 assert.deepEqual(market.filter(a=>a.wall==='south').map(a=>a.offset).sort((a,b)=>a-b),[-5.5,5.5]);
 assert.ok(market.every(a=>a.centerY===3.42));
 const fruit=raw.find(a=>a.id==='snyders-fruit'),sized=withPhysicalSize(fruit);
 assert.equal(fruit.physicalSize.heightCm,206);assert.equal(fruit.physicalSize.widthCm,342);
 assert.equal(sized.height,4.12);assert.equal(sized.width,6.84);assert.equal(sized.displayScale,2);
 assert.equal(sized.physicalSize,fruit.physicalSize);
 const supper=withPhysicalSize(raw.find(a=>a.id==='leonardo-last-supper'));
 assert.equal(supper.displayScale,1);assert.equal(supper.width,8.8);assert.equal(supper.height,4.6);
 assert.ok(raw.filter(a=>a.id!==supper.id).every(a=>a.displayScale===2));
});
test('缺少原作尺寸不能静默使用任意展示高度，小画使用合适画框与挂画高度',()=>{
 for(const physicalSize of [undefined,{heightCm:0,widthCm:33,source:'https://example.com'},{heightCm:42,widthCm:NaN,source:'https://example.com'},{heightCm:42,widthCm:33}]){
  assert.throws(()=>withPhysicalSize({id:'invalid',height:2,physicalSize}),/原作尺寸/);
 }
 assert.equal(artworkFrameBorder(.33,.42),.04);
 assert.equal(defaultArtworkCenter({width:.33,height:.42}),1.65);
});
test('批量导入目录保留原作尺寸、扩厅后位置与挂画高度',async()=>{
 for(const name of ['market-hall','renaissance'])for(const entry of JSON.parse(await fs.readFile(new URL(`../docs/${name}-catalog.json`,import.meta.url),'utf8'))){
  const current=raw.find(a=>a.id===entry.id);
  assert.deepEqual(entry.physicalSize,current.physicalSize);assert.equal(entry.displayScale,current.displayScale);assert.equal(entry.offset,current.offset);assert.equal(entry.centerY,current.centerY);
 }
});
