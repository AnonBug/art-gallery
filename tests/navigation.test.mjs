import {test} from 'node:test';import assert from 'node:assert/strict';
import {fitDistance,shortestAngle,joystickVector,canOpen,mouseLook} from '../src/navigation.mjs';
test('锁定鼠标的相对位移同时驱动上下左右，不受屏幕边缘限制',()=>{
 const look=mouseLook(0,0,100,-80);assert.equal(look.yaw,-.2);assert.equal(look.pitch,.16);
 assert.deepEqual(mouseLook(look.yaw,look.pitch,-100,80),{yaw:0,pitch:0});
 assert.deepEqual(mouseLook(.7,.3,0,0),{yaw:.7,pitch:.3});
 let yaw=0;for(let i=0;i<100;i++)yaw=mouseLook(yaw,0,100,0).yaw;
 assert.ok(yaw<-2*Math.PI,'相对位移允许持续转过一整圈');
 assert.ok(mouseLook(0,0,0,-10000).pitch<Math.PI/2);
 assert.ok(mouseLook(0,0,0,10000).pitch>-Math.PI/2);
});
test('审视距离同时适应横屏、竖屏，整幅画保留舒适边距',()=>{for(const aspect of [16/9,390/844,844/390,.3])for(const [w,h]of [[2.6,3.4],[3.07,2.8],[1.1,1.5]]){const d=fitDistance(w,h,aspect,52);const visibleHeight=2*d*Math.tan(26*Math.PI/180);assert.ok(visibleHeight>h*1.25);assert.ok(visibleHeight*aspect>w*1.25);}});
test('转向取最短弧，不绕整圈',()=>{const target=shortestAngle(3.12,-3.12);assert.ok(Math.abs(target-3.12)<.1);});
test('摇杆越界保持圆形约束，大小连续控制速度',()=>{const small=joystickVector(5,-5,38),large=joystickVector(90,-90,38);assert.ok(Math.hypot(small.x,small.y)<.2);assert.ok(Math.abs(Math.hypot(large.x,large.y)-1)<1e-8);assert.deepEqual(joystickVector(0,0,38),{x:0,y:0});});
test('完成驻足后再次点击同一幅画可打开，走近途中或离开位置后需先驻足',()=>{assert.equal(canOpen('a','a',false,.01),true);for(const args of [['a','b',false,0],['a','a',true,0],['a','a',false,1]])assert.equal(canOpen(...args),false);});
