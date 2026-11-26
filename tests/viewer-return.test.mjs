import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function fixture(){
 class Element extends EventTarget {
  hidden=false;nodes=new Map();children=[];
  set innerHTML(value){this.html=value;this.children=[];}get innerHTML(){return this.html??'';}
  set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text??'';}
  append(...children){this.children.push(...children);}
  setAttribute(){}focus(){}replaceChildren(){}
  getBoundingClientRect(){return {top:0,bottom:600,left:0,right:800};}
  querySelector(selector){if(selector==='button')return this.children.find(child=>child.tagName==='button')??null;if(!this.nodes.has(selector))this.nodes.set(selector,new Element());return this.nodes.get(selector);}
 }
 const doc=new EventTarget();doc.body={append(){}};doc.createElement=tagName=>Object.assign(new Element(),{tagName});
 const source=await fs.readFile(new URL('../src/viewer.ts',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const exports={},order=[],changes=[],sources=[],zoom=[],instances=[];
 const osd=options=>{assert.equal(options.crossOriginPolicy,'Anonymous');assert.equal(options.ajaxWithCredentials,false);sources.push(options.tileSources);const handlers=new Map();const instance={handlers,world:{getItemCount:()=>0},viewport:{zoomBy:value=>zoom.push(value),applyConstraints(){},goHome:()=>zoom.push('home')},addHandler:(name,handler)=>handlers.set(name,handler),removeAllHandlers:name=>handlers.delete(name),destroy(){}};instances.push(instance);return instance;};
 const win=new EventTarget();win.setTimeout=()=>0;
 vm.runInNewContext(code,{exports,require:id=>id==='openseadragon'?osd:{VERSION:'test'},document:doc,window:win,ResizeObserver:class{observe(){}},clearTimeout});
 const viewer=new exports.ArtViewer(()=>{},(...args)=>{order.push('change');changes.push(args);},[]);
 viewer.root.hidden=false;viewer.lastFocus={focus(){order.push('focus');}};
 return {viewer,order,changes,sources,zoom,instances,emit:(name,event={})=>instances.at(-1).handlers.get(name)?.(event)};
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

test('高清查看器只加载默认DZI，保留放大缩小和全画复位',async()=>{
 const {viewer,sources,zoom}=await fixture();
 viewer.open({id:'prodigal',title:'浪子回头',detail:{dzi:'/assets/artworks/prodigal/detail.dzi',width:6131,height:8000}});
 assert.deepEqual(sources,['/assets/artworks/prodigal/detail.dzi']);assert.equal(viewer.state.source,'detail');
 assert.ok(!viewer.root.innerHTML.includes('查看原画'));
 for(const id of ['zoom-in','zoom-out','zoom-home'])viewer.root.querySelector('#'+id).dispatchEvent(new Event('click'));
 assert.deepEqual(zoom,[1.5,1/1.5,'home']);
 viewer.close();
});

test('失败瓦片自动重试成功后清除错误，其他瓦片绘制不能掩盖未恢复的失败',async()=>{
 const {viewer,emit}=await fixture();
 viewer.open({id:'prodigal',title:'浪子回头',detail:{dzi:'/assets/artworks/prodigal/detail.dzi',width:6131,height:8000}});
 const status=viewer.root.querySelector('.viewer-status');
 const first={toString:()=> '13/0_0'},second={toString:()=> '13/1_0'};
 emit('tile-load-failed',{tile:first,message:'Image load aborted - XHR error',tileRequest:{status:0}});
 emit('tile-load-failed',{tile:second,message:'Image load aborted - XHR error',tileRequest:{status:503}});
 assert.equal(status.hidden,false);
 emit('tile-drawn',{tile:{}});assert.equal(status.hidden,false,'另一张瓦片绘制不能隐藏错误');
 emit('tile-loaded',{tile:first});assert.equal(status.hidden,false,'仍有一张瓦片未恢复');
 emit('tile-loaded',{tile:second});assert.equal(status.hidden,true,'所有失败瓦片恢复后不应保留重新加载提示');
});

test('切换作品清理失败状态，过期的瓦片事件不能污染新查看器',async()=>{
 const {viewer,emit,instances}=await fixture();
 const artwork={id:'prodigal',title:'浪子回头',detail:{dzi:'/assets/artworks/prodigal/detail.dzi',width:6131,height:8000}};
 viewer.open(artwork);
 const tile={toString:()=> '13/0_0'},oldFailure=instances[0].handlers.get('tile-load-failed');
 emit('tile-load-failed',{tile,message:'offline'});
 viewer.open({...artwork,id:'next'});
 oldFailure({tile,message:'late failure'});
 emit('tile-drawn');
 assert.equal(viewer.root.querySelector('.viewer-status').hidden,true);
 assert.equal(viewer.state.failedTiles,0);
});
