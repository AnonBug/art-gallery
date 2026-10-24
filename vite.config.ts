import {defineConfig} from 'vite';
import path from 'node:path';
import artworks from './src/data/artworks.json';
import {packageGallery} from './scripts/package-gallery.mjs';
let outDir:string;
export default defineConfig({
 server:{host:'0.0.0.0',port:5173},preview:{host:'0.0.0.0'},
 plugins:[{
  name:'package-current-gallery',apply:'build',
  configResolved(config){outDir=path.resolve(config.root,config.build.outDir);},
  async closeBundle(){const report=await packageGallery(outDir,artworks);console.log(`Gallery package: ${report.artworks} artworks, ${(report.bytes/1e6).toFixed(1)} MB (1000 MB budget)`);},
 }],
 build:{rollupOptions:{output:{manualChunks:{three:['three'],viewer:['openseadragon']}}}},
});
