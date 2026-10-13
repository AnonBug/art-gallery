import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const artworks=JSON.parse(await fs.readFile(new URL('../src/data/artworks.json',import.meta.url),'utf8'));
const sculptures=JSON.parse(await fs.readFile(new URL('../src/data/sculptures.json',import.meta.url),'utf8'));
const stories=JSON.parse(await fs.readFile(new URL('../src/data/stories.json',import.meta.url),'utf8'));

test('所有展出的画作与雕塑都有可阅读的背景故事、核查日期和有效来源链接',()=>{
 for(const id of [...artworks.map(a=>a.id),...sculptures.map(s=>s.id)]){
  const story=stories[id];assert.ok(story,`${id} 缺少背景故事`);
  assert.ok(story.title.trim().length>0,`${id} 缺少故事标题`);
  assert.ok(story.paragraphs.length>=2,`${id} 需要创作或收藏背景，不能只重复一句描述`);
  assert.ok(story.paragraphs.every(p=>typeof p==='string'&&p.trim().length>0));
  assert.match(story.checkedAt,/^\d{4}-\d{2}-\d{2}$/);
  assert.ok(story.sources.length>0,`${id} 缺少来源`);
  for(const source of story.sources){assert.ok(source.label.trim());assert.equal(new URL(source.url).protocol,'https:');}
 }
});
