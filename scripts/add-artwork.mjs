import fs from 'node:fs/promises';
const [id,wall='north',offset='0',height='2',centerY='2.6']=process.argv.slice(2);
if(!id||!['north','south','east','west'].includes(wall)||![offset,height,centerY].every(v=>Number.isFinite(Number(v)))||Number(height)<=0)throw new Error('用法：npm run artwork:add -- <id> <north|south|east|west> <沿墙位置> <展示高度米> [中心高度米]');
const artwork=JSON.parse(await fs.readFile(`public/assets/artworks/${id}/metadata.json`,'utf8'));
const file='src/data/artworks.json';const collection=JSON.parse(await fs.readFile(file,'utf8'));
const entry={collection:'馆藏归属待确认',displayStatus:'当前实际陈列位置待确认',licenseStatus:artwork.license||'待确认',...artwork,wall,offset:Number(offset),height:Number(height),centerY:Number(centerY)};
const index=collection.findIndex(a=>a.id===id);if(index<0)collection.push(entry);else collection[index]=entry;
await fs.writeFile(file,JSON.stringify(collection,null,2)+'\n');
console.log(`已${index<0?'添加':'更新'}《${entry.title}》，请检查是否与同墙作品重叠，然后 npm run assets:check。`);
