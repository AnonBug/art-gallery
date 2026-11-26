import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

test('开发代理从指定release读取资源，不向OSS转发浏览器来源和凭据',async()=>{
 const requests=[];
 const upstream=http.createServer((request,response)=>{
  requests.push({url:request.url,headers:request.headers});
  response.writeHead(200,{'Content-Type':'application/xml'});
  response.end('<Image/>');
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const previous=process.env.VITE_ASSET_BASE_URL;
 process.env.VITE_ASSET_BASE_URL=`http://127.0.0.1:${upstream.address().port}/releases/test/`;
 let vite;
 try{
  vite=await createServer({
   configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url)),
   mode:'test',logLevel:'silent',
   server:{host:'127.0.0.1',port:0,strictPort:false,watch:null},
  });
  await vite.listen();
  assert.equal(vite.config.publicDir,'','本地资源不能进入站点构建');
  const response=await fetch(`http://127.0.0.1:${vite.httpServer.address().port}/__gallery_assets/assets/artworks/example/detail.dzi`,{
   headers:{Origin:'http://localhost:5173',Referer:'http://localhost:5173/',Cookie:'test=local-only',Authorization:'Bearer local-only'},
  });
  assert.equal(response.status,200);assert.equal(await response.text(),'<Image/>');
  assert.equal(requests.length,1);assert.equal(requests[0].url,'/releases/test/assets/artworks/example/detail.dzi');
  for(const header of ['origin','referer','cookie','authorization'])assert.equal(requests[0].headers[header],undefined);
 }finally{
  await vite?.close();
  await new Promise(resolve=>upstream.close(resolve));
  if(previous===undefined)delete process.env.VITE_ASSET_BASE_URL;else process.env.VITE_ASSET_BASE_URL=previous;
 }
});
