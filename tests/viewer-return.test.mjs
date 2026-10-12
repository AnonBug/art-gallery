import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function fixture(){
 class Element extends EventTarget {
  hidden=false;nodes=new Map();
  setAttribute(){}focus(){}replaceChildren(){}
  querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}
 }
 const doc=new EventTarget();doc.body={append(){}};doc.createElement=()=>new Element();
 const source=await fs.readFile(new URL('../src/viewer.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exports={},order=[],changes=[];
 vm.runInNewContext(code,{exports,require:id=>id==='openseadragon'?{}:{VERSION:'test'},document:doc,window:new EventTarget(),ResizeObserver:class{observe(){}},clearTimeout});
 const viewer=new exports.ArtViewer(()=>{},(...args)=>{order.push('change');changes.push(args);},[]);
 viewer.root.hidden=false;viewer.lastFocus={focus(){order.push('focus');}};
 return {viewer,order,changes};
}

test('点击高清关闭按钮直接传递恢复漫游意图，并先恢复焦点再锁定',async()=>{
 const {viewer,order,changes}=await fixture();
 viewer.root.querySelector('#viewer-close').dispatchEvent(new Event('click'));
 assert.equal(viewer.isOpen,false);assert.deepEqual(changes,[[false,true]]);assert.deepEqual(order,['focus','change']);
 viewer.close(true);assert.equal(changes.length,1,'已经关闭时不重复请求锁定');
});

test('Esc使用的默认关闭保留暂停，不自动请求恢复漫游',async()=>{
 const {viewer,changes}=await fixture();viewer.close();
 assert.equal(viewer.isOpen,false);assert.deepEqual(changes,[[false,false]]);
});
