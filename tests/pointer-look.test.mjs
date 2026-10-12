import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installPointerLook} from '../src/pointer-look.mjs';

function fixture(enabled=true){
 const doc=new EventTarget(),win=new EventTarget(),canvas=new EventTarget();
 Object.assign(doc,{defaultView:win,pointerLockElement:null,hidden:false});canvas.ownerDocument=doc;
 const moves=[],clicks=[],changes=[],errors=[];let requests=0;
 const fire=(target,type,fields={})=>target.dispatchEvent(Object.assign(new Event(type),fields));
 canvas.requestPointerLock=()=>{requests++;doc.pointerLockElement=canvas;fire(doc,'pointerlockchange');return Promise.resolve();};
 doc.exitPointerLock=()=>{doc.pointerLockElement=null;fire(doc,'pointerlockchange');};
 const control=installPointerLook(canvas,{onMove:(...v)=>moves.push(v),onClick:(...v)=>clicks.push(v),onChange:(...v)=>changes.push(v),onError:()=>errors.push(true)},enabled);
 const click=(x=1200,y=30)=>{fire(canvas,'pointerdown',{pointerType:'mouse',button:0,clientX:x,clientY:y});fire(canvas,'click',{button:0,clientX:x,clientY:y});};
 return {doc,win,canvas,control,moves,clicks,changes,errors,fire,click,get requests(){return requests;}};
}

test('首次点击只锁定鼠标；锁定后仅转发相对位移，点击不携带鼠标屏幕坐标',()=>{
 const f=fixture();assert.equal(f.control.paused,true);
 f.fire(f.doc,'mousemove',{movementX:100,movementY:50});assert.equal(f.moves.length,0);
 f.click();assert.equal(f.control.locked,true);assert.equal(f.clicks.length,0);
 f.fire(f.doc,'mousemove',{movementX:100,movementY:-50});assert.deepEqual(f.moves,[[100,-50]]);
 f.click(10,10);assert.deepEqual(f.clicks,[[]],'点击只通知中心拾取，不传递clientX/clientY');
 f.control.dispose();
});
test('Esc显示鼠标并暂停相机，下一次点击只恢复锁定，不穿透点击作品',()=>{
 const f=fixture();f.click();f.fire(f.doc,'keydown',{code:'Escape'});
 assert.equal(f.control.locked,false);assert.equal(f.control.paused,true);
 f.fire(f.doc,'mousemove',{movementX:500,movementY:500});assert.equal(f.moves.length,0);
 f.click();assert.equal(f.control.locked,true);assert.equal(f.clicks.length,0);
 f.click();assert.equal(f.clicks.length,1);f.control.dispose();
});
test('面板暂停会释放锁定，解除暂停本身不锁定；失焦和后台也释放锁定',()=>{
 const f=fixture();f.click();f.control.suspend(true);
 assert.equal(f.control.locked,false);f.click();assert.equal(f.requests,1);
 f.control.suspend(false);assert.equal(f.control.paused,true);
 f.click();f.fire(f.win,'blur');assert.equal(f.control.locked,false);
 f.click();f.doc.hidden=true;f.fire(f.doc,'visibilitychange');assert.equal(f.control.locked,false);
 f.control.dispose();f.fire(f.doc,'mousemove',{movementX:20,movementY:20});assert.equal(f.moves.length,0);
});
test('锁定失败可重试，触屏保持拖动/点按模式',async()=>{
 const f=fixture(false);assert.equal(f.control.paused,false);
 f.canvas.requestPointerLock=()=>Promise.reject(new Error('Denied'));
 f.click();await Promise.resolve();assert.equal(f.errors.length,1);assert.equal(f.control.paused,true);
 f.canvas.requestPointerLock=()=>{f.doc.pointerLockElement=f.canvas;f.fire(f.doc,'pointerlockchange');};
 f.click();assert.equal(f.control.locked,true);
 f.fire(f.canvas,'pointerdown',{pointerType:'touch',button:0});assert.equal(f.control.enabled,false);assert.equal(f.control.locked,false);assert.equal(f.control.paused,false);
 f.control.dispose();
});
test('连续多指触摸不会反复重置触控输入，保留展厅双指防误触逻辑',()=>{
 const f=fixture(false),count=f.changes.length;
 f.fire(f.canvas,'pointerdown',{pointerType:'touch',pointerId:1,button:0});
 f.fire(f.canvas,'pointerdown',{pointerType:'touch',pointerId:2,button:0});
 assert.equal(f.changes.length,count);assert.equal(f.requests,0);
 f.control.dispose();
});

test('关闭面板的点击可直接恢复锁定，关闭点击不穿透；触屏与仍打开的面板不锁定',()=>{
 const f=fixture();f.click();f.control.suspend(true);f.control.resume();assert.equal(f.requests,1);
 f.control.suspend(false);f.control.resume();assert.equal(f.control.locked,true);assert.equal(f.requests,2);
 assert.equal(f.clicks.length,0,'关闭按钮的点击不会触发作品');
 f.click();assert.equal(f.clicks.length,1,'恢复后的下一次展厅点击正常响应');f.control.dispose();
 const touch=fixture(false);touch.control.suspend(true);touch.control.suspend(false);touch.control.resume();
 assert.equal(touch.requests,0);assert.equal(touch.control.paused,false);touch.control.dispose();
});
