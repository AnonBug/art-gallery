import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {withPhysicalSize,artworkFrameBorder} from '../src/artwork-scale.mjs';
import {rooms,passage,passages,doorsFor,sculpturePosition,sculpturePositions,benchPosition,wallThickness,isWalkable,clearWalk,moveOnFloor,planWalk,positionOnRoute,roomAt,projectToFloor} from '../src/museum-layout.mjs';

test('两厅只隔普通墙厚，门洞双向通行且完整墙面不可穿过',()=>{
 assert.equal(passage.length,wallThickness);
 assert.ok(Math.abs((rooms[0].x-rooms[0].width/2)-(rooms[1].x+rooms[1].width/2)-wallThickness)<1e-8);
 for(const [a,b] of [[{x:0,z:passage.z},{x:rooms[1].x,z:passage.z}],[{x:rooms[1].x,z:passage.z},{x:0,z:passage.z}]]){
  assert.ok(clearWalk(a,b));const p=moveOnFloor(a,b);assert.ok(Math.hypot(p.x-b.x,p.z-b.z)<1e-8);
 }
 for(const z of [-4,-2.5,4]){
  const p=moveOnFloor({x:-rooms[0].width/2+1.5,z},{x:rooms[1].x-2,z});assert.ok(p.x>-rooms[0].width/2,'不能从非门口位置穿过第一厅西墙');
  const q=moveOnFloor({x:rooms[1].x+rooms[1].width/2-1.5,z},{x:0,z});assert.ok(q.x<rooms[1].x+rooms[1].width/2,'不能穿过第二厅东墙');
 }
 const p=moveOnFloor({x:passage.x,z:passage.z},{x:passage.x,z:20});assert.ok(p.z<=passage.z+passage.width/2-passage.radius+.001);
 assert.equal(roomAt({x:0,z:0}).id,'rembrandt');assert.equal(roomAt({x:rooms[1].x,z:0}).id,'market');assert.equal(roomAt({x:passage.x,z:2.6}),null);
});
test('跨展厅自动行走穿过薄墙门洞，途中的每一点都在可行走区域',()=>{
 for(const [a,b] of [[{x:4,z:-3.8},{x:rooms[1].x-4.5,z:4.5}],[{x:rooms[1].x-3,z:-4.5},{x:4,z:3.8}],[{x:passage.x,z:passage.z},{x:rooms[1].x-4.5,z:-4.5}]]){
  const direct=clearWalk(a,b),route=planWalk(a,b);assert.ok(route.length>0);if(!direct)assert.ok(route.length>1);
  let last=a;for(const stop of route){assert.ok(clearWalk(last,stop));last=stop;}
  for(let i=0;i<=1000;i++)assert.ok(isWalkable(positionOnRoute(a,route,i/1000)));
  const end=positionOnRoute(a,route,1);assert.ok(Math.hypot(end.x-b.x,end.z-b.z)<1e-8);
 }
});
test('门洞边缘限制身体宽度，展厅各自边界不会把相机送回第一厅',()=>{
 for(const r of rooms){const p=projectToFloor({x:r.x-100,z:100},r.id);assert.ok(isWalkable(p));assert.equal(roomAt(p).id,r.id);}
 assert.ok(isWalkable({x:passage.x,z:passage.z}));assert.equal(isWalkable({x:passage.x,z:passage.z+passage.width/2}),false);
 assert.deepEqual(planWalk({x:rooms[1].x,z:0},{x:rooms[1].x,z:-5}),[{x:rooms[1].x,z:-5}]);
});
test('27件作品与展签均留在各自墙面内，与所有门洞、同墙作品互不重叠',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../src/data/artworks.json',import.meta.url),'utf8')).map(withPhysicalSize);
 assert.equal(data.filter(a=>a.room==='market').length,4);assert.equal(data.filter(a=>a.room==='leonardo').length,14);assert.equal(new Set(data.map(a=>a.id)).size,27);
 for(const r of rooms)for(const wall of ['north','south','east','west']){
  const limit=(wall==='north'||wall==='south'?r.width:r.depth)/2;
  const spans=data.filter(a=>(a.room??'rembrandt')===r.id&&a.wall===wall).map(a=>{
   const width=a.width,border=artworkFrameBorder(a.width,a.height);
   return {id:a.id,lo:a.offset-width/2-border,hi:a.offset+width/2+border+.24+.78};
  }).sort((a,b)=>a.lo-b.lo);
  for(const [i,s] of spans.entries()){
   assert.ok(s.lo>-limit&&s.hi<limit,`${s.id} 画框/展签不能越过墙角`);
   if(i)assert.ok(spans[i-1].hi<s.lo,`${s.id} 不能压住上一幅作品或展签`);
   for(const {side,passage:p}of doorsFor(r.id))if(wall===side){const along=wall==='north'||wall==='south'?p.x-r.x:p.z-r.z,center=(wall==='west'||wall==='south'?-1:1)*along;assert.ok(s.hi<center-p.width/2-.2||s.lo>center+p.width/2+.2,`${s.id} 不能挡住门洞`);}
  }
 }
});
test('五厅四门连通，任意两厅路线均可通行，雕塑展台不可穿越且会绕行',()=>{
 assert.equal(rooms.length,5);assert.equal(passages.length,4);
 for(const start of rooms)for(const end of rooms){
  const a={x:start.x,z:start.z},b={x:end.x+2.2,z:end.z-2.8};const route=planWalk(a,b);assert.ok(route.length,`${start.id} → ${end.id}`);
  let previous=a;for(const stop of route){assert.ok(clearWalk(previous,stop));previous=stop;}
  for(let i=0;i<=500;i++)assert.ok(isWalkable(positionOnRoute(a,route,i/500)));
  assert.ok(Math.hypot(previous.x-b.x,previous.z-b.z)<1e-8);
 }
 for(const [room,position]of Object.entries(sculpturePositions)){
  assert.equal(isWalkable(position),false);
  const a={x:position.x,z:position.z+2},b={x:position.x,z:position.z-1.4};assert.equal(clearWalk(a,b),false);assert.ok(planWalk(a,b).length>1);
  const stopped=moveOnFloor(a,b);assert.ok(stopped.z>position.z+1.29,'身体不能穿过展台');
  assert.ok(isWalkable(projectToFloor(position,room)));
 }

});
test('大小展厅中央留空，长凳偏置，门洞与标牌都低于所在房间天花',()=>{
 for(const r of rooms){assert.ok(r.height>=5.8&&r.height<=8);assert.ok(isWalkable({x:r.x,z:r.z}));if(!sculpturePositions[r.id]){const seat=benchPosition(r);assert.ok(Math.abs(seat.x-r.x)>1.82);assert.ok(Math.hypot(seat.x-r.x,seat.z-r.z)>3);}}
 for(const p of passages){assert.ok(p.width>=3&&p.width<=4.4);assert.ok(p.height+.83<Math.min(...rooms.filter(r=>r.id===p.left||r.id===p.right).map(r=>r.height)));}
});
test('扩建达芬奇厅后仍可右转进入两座小雕塑厅，拐角门洞双向可走，侧墙不可穿越',()=>{
 const leonardo=rooms[2];assert.equal(leonardo.width*leonardo.depth,560);assert.equal(rooms[3].width*rooms[3].depth,100);assert.equal(rooms[4].width*rooms[4].depth,100);
 assert.deepEqual(doorsFor('leonardo').map(d=>d.side).sort(),['south','west']);
 for(const p of passages.filter(p=>p.axis==='z')){
  const a={x:p.x,z:p.z-2},b={x:p.x,z:p.z+2};assert.ok(clearWalk(a,b));assert.ok(clearWalk(b,a));
  for(const side of [-1,1]){const x=p.x+side*(p.width/2+.5),stopped=moveOnFloor({x,z:a.z},{x,z:b.z});assert.ok(stopped.z<p.z,'门洞以外的横墙不可穿越');}
  for(const side of [-1,1])assert.equal(isWalkable({x:p.x+side*p.width/2,z:p.z}),false,'过门时仍保留身体半径');
 }
 const start={x:leonardo.x-3,z:leonardo.z},end={x:rooms[4].x+2,z:rooms[4].z};
 const route=planWalk(start,end);assert.ok(route.length>1);let previous=start;
 for(const stop of route){assert.ok(clearWalk(previous,stop));previous=stop;}
 for(let i=0;i<=1000;i++)assert.ok(isWalkable(positionOnRoute(start,route,i/1000)));
});
