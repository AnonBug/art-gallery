// A continuous suite: room coordinates, architecture and walking share this layout.
export const wallThickness = .2;
export const rooms = [
 {id:'rembrandt',name:'伦勃朗厅',artist:'伦勃朗',number:'I',x:0,z:0,width:21,depth:19,height:8,margin:1.25,wall:0x244d3c,door:'west'},
 {id:'market',name:'斯奈德斯厅',artist:'弗兰斯·斯奈德斯',number:'II',x:0,z:0,width:24.5,depth:22,height:8,margin:1.25,wall:0x514337,door:'east',entryArtwork:'snyders-fruit'},
 {id:'leonardo',name:'达芬奇厅',artist:'列奥纳多·达·芬奇',number:'III',x:0,z:0,width:20,depth:28,height:8,margin:1.25,wall:0x444b43,door:'west',entryArtwork:'leonardo-last-supper'},
 {id:'sculpture',name:'米开朗基罗厅',artist:'米开朗基罗',number:'IV',x:0,z:0,width:10,depth:10,height:5.8,margin:1,wall:0x353a3b,door:'north'},
 {id:'nefertiti',name:'图特摩斯厅',artist:'图特摩斯工作室',subtitle:'奈费尔提蒂王后像',number:'V',x:0,z:0,width:10,depth:10,height:5.8,margin:1,wall:0x274650,door:'north'},
];
rooms[1].x=rooms[0].x-rooms[0].width/2-wallThickness-rooms[1].width/2;
rooms[2].x=rooms[0].width/2+wallThickness+rooms[2].width/2;
// Enter Leonardo from the west, then turn right (south) into the sculpture wing.
rooms[3].x=rooms[2].x+2.5;
rooms[3].z=rooms[2].depth/2+wallThickness+rooms[3].depth/2;
rooms[4].x=rooms[3].x;
rooms[4].z=rooms[3].z+rooms[3].depth/2+wallThickness+rooms[4].depth/2;
export const passages = [
 {left:rooms[1].id,right:rooms[0].id,axis:'x',x:rooms[1].x+rooms[1].width/2+wallThickness/2,z:0,width:4.4,height:4.8},
 {left:rooms[0].id,right:rooms[2].id,axis:'x',x:rooms[0].width/2+wallThickness/2,z:0,width:3.2,height:3.8},
 {left:rooms[2].id,right:rooms[3].id,axis:'z',x:rooms[3].x,z:rooms[2].depth/2+wallThickness/2,width:3,height:3.8},
 {left:rooms[3].id,right:rooms[4].id,axis:'z',x:rooms[3].x,z:rooms[3].z+rooms[3].depth/2+wallThickness/2,width:3,height:3.8},
].map(p=>({...p,length:wallThickness,radius:.28}));
export const passage=passages[0];
export const doorsFor = id => passages.filter(p=>p.left===id||p.right===id).map(p=>({side:p.axis==='x'?(p.left===id?'east':'west'):(p.left===id?'south':'north'),next:p.left===id?p.right:p.left,passage:p}));
export const roomFor = id => rooms.find(r=>r.id===id)??rooms[0];
export const roomAt = p => rooms.find(r=>Math.abs(p.x-r.x)<=r.width/2&&Math.abs(p.z-r.z)<=r.depth/2)??null;
// Walking south through the north entrance, the west side is the visitor's right.
// Face the central aisle (east), so the entrance reveals the face in profile.
export const sculpturePosition={x:rooms[3].x-2.6,z:rooms[3].z,yaw:Math.PI/2};
export const sculpturePositions={sculpture:sculpturePosition,nefertiti:{x:rooms[4].x-2.6,z:rooms[4].z,yaw:Math.PI/2}};
export const sculpturePedestalHeight=1.52;
export const benchPosition=r=>r.id==='leonardo'?{x:r.x-3,z:r.z+2}:{x:r.x+r.width*.22,z:r.z+r.depth*.16};
const pedestalClearance=1.3;
const rectangles=rooms.map(r=>({x0:r.x-r.width/2+r.margin,x1:r.x+r.width/2-r.margin,z0:r.z-r.depth/2+r.margin,z1:r.z+r.depth/2-r.margin}));
for(const p of passages){const left=roomFor(p.left),right=roomFor(p.right);rectangles.push(p.axis==='x'
 ?{x0:left.x+left.width/2-left.margin-.1,x1:right.x-right.width/2+right.margin+.1,z0:p.z-p.width/2+p.radius,z1:p.z+p.width/2-p.radius}
 :{x0:p.x-p.width/2+p.radius,x1:p.x+p.width/2-p.radius,z0:left.z+left.depth/2-left.margin-.1,z1:right.z-right.depth/2+right.margin+.1});}
export const passageWaypoints=p=>{
 const a=roomFor(p.left),b=roomFor(p.right),axis=p.axis;
 return [{x:p.x,z:p.z,[axis]:p[axis]-p.length/2-a.margin-.25},{x:p.x,z:p.z,[axis]:p[axis]+p.length/2+b.margin+.25}];
};
const pedestalAt=p=>Object.values(sculpturePositions).find(s=>Math.abs(p.x-s.x)<pedestalClearance&&Math.abs(p.z-s.z)<pedestalClearance);
const insidePedestal=p=>!!pedestalAt(p);
export const isWalkable = p => !insidePedestal(p)&&rectangles.some(r=>p.x>=r.x0&&p.x<=r.x1&&p.z>=r.z0&&p.z<=r.z1);
export function projectToFloor(p,roomId){
 const candidates=roomId?[rectangles[rooms.indexOf(roomFor(roomId))]]:rectangles;
 const point=candidates.map(r=>({x:Math.max(r.x0,Math.min(r.x1,p.x)),z:Math.max(r.z0,Math.min(r.z1,p.z))})).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
 if(!insidePedestal(point))return point;
 const {x,z}=pedestalAt(point),d=pedestalClearance+.01;
 return [{x:x-d,z:point.z},{x:x+d,z:point.z},{x:point.x,z:z-d},{x:point.x,z:z+d}].sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
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
 if(!isWalkable(a)||!isWalkable(b))return [];
 if(clearWalk(a,b))return [b];
 // Visibility graph through doorway centres and around the sculpture pedestal.
 const waypoints=passages.flatMap(passageWaypoints);
 const d=pedestalClearance+.1;for(const s of Object.values(sculpturePositions))for(const x of [-d,d])for(const z of [-d,d])waypoints.push({x:s.x+x,z:s.z+z});
 const points=[a,...waypoints,b],end=points.length-1,distance=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set();distance[0]=0;
 while(visited.size<points.length){
  let i=-1;for(let j=0;j<points.length;j++)if(!visited.has(j)&&(i<0||distance[j]<distance[i]))i=j;
  if(i<0||!Number.isFinite(distance[i]))return [];if(i===end)break;visited.add(i);
  for(let j=0;j<points.length;j++)if(!visited.has(j)&&clearWalk(points[i],points[j])){const next=distance[i]+Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z);if(next<distance[j]){distance[j]=next;previous[j]=i;}}
 }
 const route=[];for(let i=end;i>0;i=previous[i]){if(i<0)return [];route.unshift(points[i]);}return route;
}
export function positionOnRoute(start,stops,t){
 const points=[start,...stops];const lengths=stops.map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
 let distance=lengths.reduce((a,b)=>a+b,0)*Math.max(0,Math.min(1,t));
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const f=lengths[i]?Math.min(1,distance/lengths[i]):1;return {x:points[i].x+(points[i+1].x-points[i].x)*f,z:points[i].z+(points[i+1].z-points[i].z)*f};}distance-=lengths[i];}
 return {x:start.x,z:start.z};
}
