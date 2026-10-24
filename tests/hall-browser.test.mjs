import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {rooms} from '../src/museum-layout.mjs';
import {assetPath} from '../src/asset-path.mjs';

async function fixture(){
 class Element extends EventTarget{
  hidden=false;attributes=new Map();nodes=new Map();dataset={};
  setAttribute(key,value){this.attributes.set(key,value);}focus(){this.focused=true;}replaceChildren(){}
  querySelector(selector){if(selector.startsWith('[data-room='))return cards.find(c=>selector.includes(`"${c.dataset.room}"`));if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}
  querySelectorAll(){return cards;}
 }
 const cards=rooms.map(r=>Object.assign(new Element(),{dataset:{room:r.id}})),focus=new Element();
 const document={createElement:()=>new Element(),activeElement:focus,body:{append(){}}};
 const source=(await fs.readFile(new URL('../src/hall-browser.ts',import.meta.url),'utf8')).replaceAll('import.meta.env.BASE_URL',JSON.stringify('/'));
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={},captures=[],changes=[],entered=[];
 const modules={'./museum-layout.mjs':{rooms},'./asset-path.mjs':{assetPath},'./sculpture-model':{sculptures:[{room:'sculpture'},{room:'nefertiti'}]}};
 vm.runInNewContext(code,{exports,require:id=>modules[id],document});
 const browser=new exports.HallBrowser([],async id=>{captures.push(id);return 'data:image/webp;base64,preview';},id=>entered.push(id),()=>changes.push(browser.isOpen));
 return {browser,cards,captures,changes,entered,focus};
}

test('首次加载不显示展厅选择或生成预览，首次手动打开也能直接关闭返回漫游',async()=>{
 const {browser,captures,changes,focus}=await fixture();
 assert.equal(browser.isOpen,false);assert.deepEqual(captures,[]);assert.deepEqual(changes,[]);
 browser.open('nefertiti');await Promise.resolve();
 assert.equal(browser.isOpen,true);assert.deepEqual(captures,['nefertiti']);assert.equal(browser.root.querySelector('#halls-close').hidden,false);
 assert.equal(browser.root.querySelector('#hall-selected-title').textContent,'图特摩斯厅');
 browser.close();assert.equal(browser.isOpen,false);assert.deepEqual(changes,[true,false]);assert.equal(focus.focused,true);
 browser.close();assert.deepEqual(changes,[true,false],'重复关闭不改变漫游状态');
});

test('按需打开时选择当前展厅，选择其他展厅后可前往且关闭切换面板',async()=>{
 const {browser,cards,entered}=await fixture();
 browser.open('sculpture');await Promise.resolve();
 assert.equal(cards.find(c=>c.dataset.room==='sculpture').attributes.get('aria-pressed'),'true');
 cards.find(c=>c.dataset.room==='leonardo').dispatchEvent(new Event('click'));await Promise.resolve();
 browser.root.querySelector('#hall-enter').dispatchEvent(new Event('click'));
 assert.equal(browser.isOpen,false);assert.deepEqual(entered,['leonardo']);
});
