import {defineConfig,loadEnv} from 'vite';
import {DEFAULT_ASSET_BASE_URL} from './src/asset-path.mjs';

export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_');
 const assetBase=(env.VITE_ASSET_BASE_URL?.trim()||DEFAULT_ASSET_BASE_URL).replace(/\/+$/,'');
 const remote=new URL(assetBase);
 if(!['https:','http:'].includes(remote.protocol)||remote.search||remote.hash){
  throw new Error('VITE_ASSET_BASE_URL must be an HTTP(S) release URL without query or fragment');
 }
 return {
  // Local processing copies must never be copied into the Pages build.
  publicDir:false,
  server:{host:'0.0.0.0',port:5173,proxy:{
   '/__gallery_assets/':{
    target:remote.origin,changeOrigin:true,
    rewrite:url=>`${remote.pathname.replace(/\/+$/,'')}/`+url.slice('/__gallery_assets/'.length),
    configure(proxy){
     proxy.on('proxyReq',request=>{
      // This is a server-to-server request for public objects, not a browser CORS request.
      for(const header of ['origin','referer','cookie','authorization'])request.removeHeader(header);
     });
    },
   },
  }},
  preview:{host:'0.0.0.0'},
  build:{rollupOptions:{output:{manualChunks:{three:['three'],viewer:['openseadragon']}}}},
 };
});
