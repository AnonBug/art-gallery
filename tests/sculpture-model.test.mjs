import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as THREE from 'three';
import {assetPath} from '../src/asset-path.mjs';

async function loaderFixture(){
 const requests=[],decoders=[],exports={};
 const data=JSON.parse(await fs.readFile(new URL('../src/data/sculptures.json',import.meta.url),'utf8'));
 class DRACOLoader{constructor(){decoders.push(this);}setDecoderPath(path){this.path=path;}setWorkerLimit(){}dispose(){this.disposed=true;}}
 class GLTFLoader{setDRACOLoader(){}load(url,success,progress,error){requests.push({url,success,progress,error});}}
 const source=(await fs.readFile(new URL('../src/sculpture-model.ts',import.meta.url),'utf8')).replaceAll('import.meta.env.BASE_URL',JSON.stringify('/art-gallery/'));
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const modules={'three':THREE,'three/addons/loaders/GLTFLoader.js':{GLTFLoader},'three/addons/loaders/DRACOLoader.js':{DRACOLoader},'./asset-path.mjs':{assetPath},'./data/sculptures.json':{default:data}};
 vm.runInNewContext(code,{exports,require:id=>modules[id]});
 const complete=(request,painted)=>{
  const scene=new THREE.Group(),material=new THREE.MeshBasicMaterial({color:0x123456});
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,3,2),material);mesh.position.set(4,7,-3);scene.add(mesh);
  request.success({scene,parser:{json:{materials:painted?[{}]:[]}}});return mesh;
 };
 return {...exports,requests,decoders,complete};
}

test('每件雕塑独立缓存，并发细看与展厅共享加载，保留彩绘且部署路径正确',async()=>{
 const f=await loaderFixture(),progress=[];
 const a=f.loadSculpture('nefertiti',()=>progress.push('queen'));
 const b=f.loadSculpture('nefertiti');
 const c=f.loadSculpture('crouching-boy',()=>progress.push('boy'));
 assert.equal(f.requests.length,2);
 assert.equal(f.requests[0].url,'/art-gallery/assets/sculptures/nefertiti/model.glb');
 assert.equal(f.decoders[0].path,'/art-gallery/assets/draco/');
 f.requests[0].progress({loaded:10,total:100});assert.deepEqual(progress,['queen']);
 const painted=f.complete(f.requests[0],true),originalMaterial=painted.material;
 f.complete(f.requests[1],false);
 const [queen,shared,boy]=await Promise.all([a,b,c]);
 assert.equal(queen,shared);assert.notEqual(queen,boy);assert.equal(queen.name,'nefertiti');assert.equal(boy.name,'crouching-boy');
 assert.equal(painted.material,originalMaterial,'彩绘材质不能被暖白石材替换');
 assert.ok(boy.children[0].children[0].material instanceof THREE.MeshStandardMaterial);
 const bounds=new THREE.Box3().setFromObject(queen);assert.ok(Math.abs(bounds.min.y)<1e-6);assert.ok(Math.abs(bounds.max.y-2.05)<1e-6);
 assert.equal(await f.loadSculpture('nefertiti'),queen);assert.equal(f.requests.length,2);
 assert.ok(f.decoders.every(d=>d.disposed));
});

test('某件雕塑加载失败可单独重试，不清除另一件已加载的模型',async()=>{
 const f=await loaderFixture(),good=f.loadSculpture('crouching-boy'),bad=f.loadSculpture('nefertiti');
 const rejected=assert.rejects(bad,/offline/);f.requests[1].error(new Error('offline'));f.complete(f.requests[0],false);
 const boy=await good;await rejected;
 const retry=f.loadSculpture('nefertiti');assert.equal(f.requests.length,3);f.complete(f.requests[2],true);await retry;
 assert.equal(await f.loadSculpture('crouching-boy'),boy);assert.equal(f.requests.length,3);
});
