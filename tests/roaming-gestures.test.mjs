import {test} from 'node:test';
import assert from 'node:assert/strict';
import {installRoamingZoomGuard} from '../src/roaming-gestures.mjs';

function dispatch(root,type,properties={}){
 const event=Object.assign(new Event(type,{cancelable:true}),properties);
 root.dispatchEvent(event);return event.defaultPrevented;
}
test('漫游时阻止多指页面缩放，单指拖动与普通滚动不被拦截',()=>{
 const root=new EventTarget();const cleanup=installRoamingZoomGuard(root,()=>true);
 for(const type of ['touchstart','touchmove']){
  assert.equal(dispatch(root,type,{touches:[{},{}]}),true);
  assert.equal(dispatch(root,type,{touches:[{}]}),false);
 }
 for(const type of ['gesturestart','gesturechange'])assert.equal(dispatch(root,type),true);
 assert.equal(dispatch(root,'wheel',{ctrlKey:true}),true);
 assert.equal(dispatch(root,'wheel',{ctrlKey:false}),false);
 cleanup();assert.equal(dispatch(root,'gesturestart'),false);
});
test('打开高清或介绍时放行事件，关闭后恢复保护；不拦截其它根节点',()=>{
 const root=new EventTarget(),viewerRoot=new EventTarget();let roaming=true;
 installRoamingZoomGuard(root,()=>roaming);
 for(const active of [true,false,true]){
  roaming=active;
  assert.equal(dispatch(root,'touchmove',{touches:[{},{}]}),active);
  assert.equal(dispatch(root,'gesturechange'),active);
 }
 assert.equal(dispatch(viewerRoot,'touchmove',{touches:[{},{}]}),false);
});
