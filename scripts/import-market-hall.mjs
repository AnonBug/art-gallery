import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
// Reuse downloaded Snyders images; supplementary originals live in originals/market-hall.
const input=process.argv[2];
if(!input)throw new Error('用法：node scripts/import-market-hall.mjs <会话下载目录>');
const catalog=JSON.parse(await fs.readFile('docs/market-hall-catalog.json','utf8'));
for(const a of catalog){
 const dir=path.join('public/assets/artworks',a.id);
 const metadata={medium:'布面油画',license:'Public domain（来源页 PD-Art 标记）',credit:'Wikimedia Commons；图像作者及来源见作品链接',...a,room:'market',displayStatus:'主题策展；不代表实体馆当前陈列',originalUrl:a.originalUrl??a.source};
 metadata.licenseStatus=metadata.license;
 try{const old=JSON.parse(await fs.readFile(path.join(dir,'metadata.json'),'utf8'));await fs.writeFile(path.join(dir,'metadata.json'),JSON.stringify({...old,...metadata},null,2)+'\n');continue;}catch(error){if(error.code!=='ENOENT')throw error;}
 const source=await fs.access(path.join(input,a.file)).then(()=>path.join(input,a.file)).catch(()=>path.join('originals/market-hall',a.file));
 const master=path.join('originals/market-hall',a.file);if(path.resolve(source)!==path.resolve(master))await fs.copyFile(source,master);
 const metaFile=path.join('originals/market-hall',a.id+'.json');await fs.writeFile(metaFile,JSON.stringify(metadata,null,2));
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/process-images.mjs',master,a.id,metaFile],{stdio:['ignore','ignore','inherit']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(a.id+' failed: '+code)));});
 console.log('已生成 '+a.title);
}
const current=JSON.parse(await fs.readFile('src/data/artworks.json','utf8')).filter(a=>a.room!=='market'&&!catalog.some(b=>a.id===b.id));
const added=await Promise.all(catalog.map(a=>fs.readFile(`public/assets/artworks/${a.id}/metadata.json`,'utf8').then(JSON.parse)));
await fs.writeFile('src/data/artworks.json',JSON.stringify([...current,...added],null,2)+'\n');
const manifest=JSON.parse(await fs.readFile('public/assets/artworks/manifest.json','utf8')).filter(a=>a.room!=='market'&&!catalog.some(b=>a.id===b.id));
await fs.writeFile('public/assets/artworks/manifest.json',JSON.stringify([...manifest,...added],null,2)+'\n');
console.log(`第二展厅已添加 ${added.length} 幅作品。`);
