// A continuous suite: room coordinates, architecture and walking share this layout.
export const wallThickness = .2;
export const rooms = [
 {id:'rembrandt',name:'光与归途',artist:'伦勃朗',number:'I',x:0,z:0,width:15,depth:13.5,height:6,margin:1.25,wall:0x244d3c,door:'west'},
 {id:'market',name:'丰盛的日常',artist:'弗兰斯·斯奈德斯',number:'II',x:0,z:0,width:17.5,depth:15.5,height:6,margin:1.25,wall:0x514337,door:'east'},
];
rooms[1].x=rooms[0].x-rooms[0].width/2-wallThickness-rooms[1].width/2;
export const passage = {x:-rooms[0].width/2-wallThickness/2,z:2.6,length:wallThickness,width:2.2,height:4.2,radius:.28};
export const roomFor = id => rooms.find(r=>r.id===id)??rooms[0];
export const roomAt = p => rooms.find(r=>Math.abs(p.x-r.x)<=r.width/2&&Math.abs(p.z-r.z)<=r.depth/2)??null;
const rectangles=rooms.map(r=>({x0:r.x-r.width/2+r.margin,x1:r.x+r.width/2-r.margin,z0:r.z-r.depth/2+r.margin,z1:r.z+r.depth/2-r.margin}));
rectangles.push({x0:rooms[1].x+rooms[1].width/2-rooms[1].margin-.1,x1:-rooms[0].width/2+rooms[0].margin+.1,z0:passage.z-passage.width/2+passage.radius,z1:passage.z+passage.width/2-passage.radius});
export const isWalkable = p => rectangles.some(r=>p.x>=r.x0&&p.x<=r.x1&&p.z>=r.z0&&p.z<=r.z1);
export function projectToFloor(p,roomId){
 const candidates=roomId?[rectangles[rooms.indexOf(roomFor(roomId))]]:rectangles;
 return candidates.map(r=>({x:Math.max(r.x0,Math.min(r.x1,p.x)),z:Math.max(r.z0,Math.min(r.z1,p.z))})).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
}
export function clearWalk(a,b){
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1));
 for(let i=0;i<=steps;i++){const t=i/steps;if(!isWalkable({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t}))return false;}
 return true;
}
// Sweep in small steps so a large frame delta cannot tunnel through a wall; slide along it.
export function moveOnFloor(a,b){
 const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.08));let p={x:a.x,z:a.z};
 const dx=(b.x-a.x)/steps,dz=(b.z-a.z)/steps;
 for(let i=0;i<steps;i++){
  const next={x:p.x+dx,z:p.z+dz};
  if(isWalkable(next))p=next;
  else{const x={x:p.x+dx,z:p.z};if(isWalkable(x))p=x;const z={x:p.x,z:p.z+dz};if(isWalkable(z))p=z;}
 }
 return p;
}
export function planWalk(a,b){
 if(clearWalk(a,b))return [b];
 const left={x:rooms[1].x+rooms[1].width/2-rooms[1].margin-.25,z:passage.z},right={x:rooms[0].x-rooms[0].width/2+rooms[0].margin+.25,z:passage.z};
 const stops=a.x<b.x?[left,right]:[right,left];
 const points=[a,...stops,b],result=[];let index=0;
 while(index<points.length-1){let next=points.length-1;while(next>index+1&&!clearWalk(points[index],points[next]))next--;if(!clearWalk(points[index],points[next]))return [];result.push(points[next]);index=next;}
 return result;
}
export function positionOnRoute(start,stops,t){
 const points=[start,...stops];const lengths=stops.map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
 let distance=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,t));
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const f=lengths[i]?Math.min(1,distance/lengths[i]):1;return {x:points[i].x+(points[i+1].x-points[i].x)*f,z:points[i].z+(points[i+1].z-points[i].z)*f};}distance-=lengths[i];}
 return {x:start.x,z:start.z};
}
