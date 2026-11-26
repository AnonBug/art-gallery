import fs from 'node:fs/promises';
import {loadEnv} from 'vite';
import {assetPath,DEFAULT_ASSET_BASE_URL} from '../src/asset-path.mjs';

const args=process.argv.slice(2);
function option(name,fallback){
 const index=args.indexOf(name);
 if(index<0)return fallback;
 if(!args[index+1]||args[index+1].startsWith('--'))throw new Error(`Missing value for ${name}`);
 return args[index+1];
}
const env=loadEnv(option('--mode','production'),process.cwd(),'VITE_');
const base=option('--base',env.VITE_ASSET_BASE_URL?.trim()||DEFAULT_ASSET_BASE_URL);
const origin=option('--origin','https://anonbug.github.io');
const artworks=JSON.parse(await fs.readFile('src/data/artworks.json','utf8'));
const sculptures=JSON.parse(await fs.readFile('src/data/sculptures.json','utf8'));
const resources=new Map(),errors=[];
let httpChecks=0,tiles=0,dzi=0;
const add=(url,limits={})=>resources.set(url,limits);

async function request(url,method='HEAD'){
 const target=assetPath(url,base);
 // Retry temporary network and server failures, but never hide missing objects.
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(target,{method,headers:{Origin:origin,Referer:origin+'/'},signal:AbortSignal.timeout(15000)});
   httpChecks++;
   if(!response.ok){
    await response.body?.cancel();
    if(response.status>=500&&attempt<2)continue;
    throw new Error(`HTTP ${response.status}`);
   }
   const cors=response.headers.get('access-control-allow-origin');
   if(cors!=='*'&&cors!==origin){await response.body?.cancel();throw new Error(`CORS does not allow ${origin}`);}
   if(response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();throw new Error('Returned HTML instead of an asset');}
   return response;
  }catch(error){
   if(attempt<2&&(error instanceof TypeError||error.name==='TimeoutError'))continue;
   throw new Error(`${target}: ${error.message}`);
  }
 }
}

for(const artwork of artworks){
 for(const variant of artwork.variants)add(variant.url,{maxBytes:3_000_000});
 add(artwork.detail.url,{maxBytes:20_000_000});
 add(`/assets/artworks/${artwork.id}/metadata.json`);
 const url=artwork.detail.dzi;
 if(!url)continue;
 try{
  const response=await request(url,'GET'),xml=await response.text();
  const attr=name=>Number(xml.match(new RegExp(`${name}="(\\d+)"`))?.[1]);
  const width=attr('Width'),height=attr('Height'),tileSize=attr('TileSize');
  const format=xml.match(/Format="(jpg|jpeg|png)"/)?.[1];
  if(width!==artwork.detail.width||height!==artwork.detail.height||!tileSize||!format)throw new Error('Invalid DZI dimensions, tile size or format');
  const maxLevel=Math.ceil(Math.log2(Math.max(width,height)));
  for(let level=0;level<=maxLevel;level++){
   const scale=2**(maxLevel-level);
   for(let x=0;x<Math.ceil(Math.ceil(width/scale)/tileSize);x++){
    for(let y=0;y<Math.ceil(Math.ceil(height/scale)/tileSize);y++){
     add(url.replace(/\.dzi$/,'_files')+`/${level}/${x}_${y}.${format}`);tiles++;
    }
   }
  }
  dzi++;
 }catch(error){errors.push(`${url}: ${error.message}`);}
}
for(const sculpture of sculptures){
 add(sculpture.model,{bytes:sculpture.bytes});add(sculpture.poster);
 add(`/assets/sculptures/${sculpture.id}/metadata.json`);
}
for(const file of ['draco_decoder.js','draco_decoder.wasm','draco_wasm_wrapper.js'])add(`/assets/draco/${file}`);

console.log(`Checking ${resources.size} OSS objects and ${dzi} DZI descriptors; origin ${origin}`);
const pending=[...resources];
await Promise.all(Array.from({length:12},async()=>{
 while(pending.length){
  const [url,limits]=pending.pop();
  try{
   const response=await request(url),length=response.headers.get('content-length');
   if(length!==null){
    const bytes=Number(length);
    if(bytes<=0)throw new Error('Empty object');
    if(limits.bytes!==undefined&&bytes!==limits.bytes)throw new Error(`Expected ${limits.bytes} bytes, received ${bytes}`);
    if(limits.maxBytes&&bytes>limits.maxBytes)throw new Error(`Exceeds ${limits.maxBytes} bytes`);
   }else if(limits.bytes!==undefined)throw new Error('Missing Content-Length for model size check');
  }catch(error){errors.push(`${url}: ${error.message}`);}
 }
}));
const report={base,origin,checkedAt:new Date().toISOString(),artworks:artworks.length,sculptures:sculptures.length,dzi,tiles,httpChecks,errors};
await fs.mkdir('output',{recursive:true});
await fs.writeFile('output/oss-resource-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(errors.length)process.exitCode=1;
