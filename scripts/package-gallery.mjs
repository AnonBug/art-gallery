import fs from 'node:fs/promises';
import path from 'node:path';

// Vite copies public/ first. Trim only its build output; keep source images and reserves.
export async function packageGallery(outDir,artworks,{maxBytes=1_000_000_000}={}){
 const root=path.resolve(outDir),artRoot=path.join(root,'assets/artworks'),keep=new Map();
 const add=url=>{
  const match=/^\/assets\/artworks\/([a-z0-9-]+)\/([a-zA-Z0-9_.-]+)$/.exec(url??'');
  if(!match||['.','..'].includes(match[2]))throw new Error(`Invalid artwork asset: ${url}`);
  const [,folder,file]=match;
  if(!keep.has(folder))keep.set(folder,new Set());
  keep.get(folder).add(file);
 };
 for(const a of artworks){
  if(!/^[a-z0-9-]+$/.test(a.id))throw new Error(`Invalid artwork id: ${a.id}`);
  add(`/assets/artworks/${a.id}/metadata.json`);
  // An updated image can live in a versioned folder different from the artwork id.
  for(const v of a.variants)add(v.url);
  for(const v of [a.detail]){
   if(v.dzi){add(v.dzi);add(v.dzi.replace(/\.dzi$/,'_files'));}
   else if(v.url)add(v.url);
  }
 }
 for(const [folder,files]of keep)for(const file of files)await fs.access(path.join(artRoot,folder,file));
 for(const entry of await fs.readdir(artRoot,{withFileTypes:true})){
  const folder=path.join(artRoot,entry.name),files=keep.get(entry.name);
  if(entry.isDirectory()&&!files){await fs.rm(folder,{recursive:true});continue;}
  if(!files)continue;
  for(const file of await fs.readdir(folder))if(!files.has(file))await fs.rm(path.join(folder,file),{recursive:true});
 }
 async function size(folder){
  let total=0;
  for(const entry of await fs.readdir(folder,{withFileTypes:true})){
   const file=path.join(folder,entry.name);
   if(entry.name==='.DS_Store'){await fs.rm(file);continue;}
   total+=entry.isDirectory()?await size(file):(await fs.stat(file)).size;
  }
  return total;
 }
 const bytes=await size(root);
 if(bytes>maxBytes)throw new Error(`Gallery build is ${(bytes/1e6).toFixed(1)} MB; Pages budget is ${maxBytes/1e6} MB`);
 return {artworks:artworks.length,bytes};
}
