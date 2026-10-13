import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {setOverlayInteractivity} from '../src/overlay-interactivity.mjs';

test('作品档案位于app内部时，暂停只禁用背景，档案和关闭按钮仍可交互',async()=>{
 const background=Array.from({length:5},()=>({inert:false}));
 const dialog={inert:false},closeButton={inert:false};
 const app={inert:true,querySelectorAll(selector){assert.equal(selector.includes('#info'),false);return background;}};
 setOverlayInteractivity(app,true);
 assert.equal(app.inert,false,'档案祖先不能 inert');assert.ok(background.every(e=>e.inert));assert.equal(dialog.inert,false);assert.equal(closeButton.inert,false);
 setOverlayInteractivity(app,false);assert.ok(background.every(e=>!e.inert));assert.equal(app.inert,false);
 const source=await fs.readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.ok(source.includes('setOverlayInteractivity(app,!roaming)'));
 assert.ok(!/app\.inert\s*=\s*true|app\.inert\s*=\s*!roaming/.test(source),'主流程不重新禁用档案祖先');
});
