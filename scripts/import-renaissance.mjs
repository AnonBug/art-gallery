// Download the exact Commons originals, then use the existing local image pipeline.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
const catalog=JSON.parse(await fs.readFile('docs/renaissance-catalog.json','utf8'));
await fs.mkdir('originals/renaissance',{recursive:true});
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.on('error',reject);child.on('close',code=>code?reject(new Error(output)):resolve(output));});}
async function importArtwork(a){
 const hash=crypto.createHash('md5').update(a.file).digest('hex');
 const originalUrl=`https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0,2)}/${encodeURIComponent(a.file)}`;
 const source=`https://commons.wikimedia.org/wiki/File:${encodeURIComponent(a.file)}`;
 const input=`originals/renaissance/${a.id}.jpg`,metaFile=`originals/renaissance/${a.id}.json`;
 const meta={...a,room:'leonardo',source,originalUrl,displayStatus:'数字主题策展，非实体展厅复原',licenseStatus:a.licenseStatus??`${a.license}（来源页核查：2026-10-13）`};
 await fs.writeFile(metaFile,JSON.stringify(meta,null,2)+'\n');
 try{await fs.access(input);}catch{
  console.log(`下载《${a.title}》原始文件…`);
  await run('curl',['-fL','--connect-timeout','20','--max-time','600','--retry','3','--retry-delay','5',originalUrl,'-o',input+'.part']);
  await fs.rename(input+'.part',input);
 }
 const generated=`public/assets/artworks/${a.id}/metadata.json`;
 try{await fs.access(generated);}catch{console.log(`生成《${a.title}》展示图与高清瓦片…`);await run(process.execPath,['scripts/process-images.mjs',input,a.id,metaFile]);}
 return {...JSON.parse(await fs.readFile(generated,'utf8')),...meta};
}
const imported=[];
// Limit concurrent original downloads and image processing to two.
const queue=[...catalog];
await Promise.all(Array.from({length:2},async()=>{while(queue.length){const a=queue.shift();imported.push(await importArtwork(a));console.log(`完成《${a.title}》`);}}));
const file='src/data/artworks.json',artworks=JSON.parse(await fs.readFile(file,'utf8'));
for(const a of imported){const i=artworks.findIndex(x=>x.id===a.id);if(i<0)artworks.push(a);else artworks[i]=a;}
await fs.writeFile(file,JSON.stringify(artworks,null,2)+'\n');
console.log('已导入达芬奇厅五幅作品。');
