import OpenSeadragon from 'openseadragon';
import type { Artwork } from './types';
import { VERSION } from './data/theme';

interface TileJob {userData:{request?:XMLHttpRequest;image?:HTMLImageElement};finish:(...args:unknown[])=>void;abort:()=>void;jobId:number;callback:(...args:unknown[])=>void}
interface ArtworkView {x:number;y:number;zoom:number}
// OSD normally re-reads device DPR on resize. Keep the tiled canvas bounded after rotation too.
(OpenSeadragon as unknown as {getCurrentPixelDensityRatio:()=>number}).getCurrentPixelDensityRatio=()=>1;
export class ArtViewer {
 private jobs=new Set<TileJob>();
 private viewer: OpenSeadragon.Viewer | null = null;
 private artwork: Artwork | null = null;
 private original = false;
 private pendingView: ArtworkView | null = null;
 private generation = 0;
 private timer = 0;
 private resizeObserver: ResizeObserver;
 private logs: string[] = [];
 private lastFocus: HTMLElement | null = null;
 readonly root: HTMLElement;
 private stage: HTMLElement;
 private status: HTMLElement;
 private diagnostic: HTMLElement;
 constructor(private onInfo: (a:Artwork)=>void, private onChange: (open:boolean,resume?:boolean)=>void, private collection:Artwork[]) {
  this.root=document.createElement('section');this.root.className='viewer-overlay';this.root.hidden=true;
  this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','高清看画');
  this.root.innerHTML=`<div class="viewer-stage" id="osd"></div>
   <header class="viewer-header">
    <div class="viewer-heading"><h2 id="viewer-title"></h2><small>v${VERSION.split(' · ')[0]}</small></div>
    <div class="viewer-actions"><button id="viewer-info">作品介绍</button><button id="viewer-close" aria-label="关闭高清看画">关闭 ✕</button></div>
   </header>
   <div class="viewer-status" role="status"></div>
   <aside class="viewer-map" aria-label="画幅位置小地图" hidden><span>画幅位置</span><div id="artwork-map" class="viewer-map-viewport" title="点击或拖动小地图定位"></div></aside>
   <footer class="viewer-footer" aria-label="看画工具栏">
    <button id="previous-art" aria-label="上一幅作品" title="上一幅作品">‹</button><button id="next-art" aria-label="下一幅作品" title="下一幅作品">›</button>
    <button id="zoom-out" aria-label="缩小" title="缩小">−</button><button id="zoom-home" title="显示完整画作">全画</button><button id="zoom-in" aria-label="放大" title="放大">＋</button>
    <button id="original">查看原画</button><button id="viewer-diag" aria-label="切换高清诊断" title="高清诊断">诊断</button>
   </footer><pre class="viewer-diagnostics" hidden></pre>`;
  document.body.append(this.root);
  this.stage=this.root.querySelector('.viewer-stage')!;this.status=this.root.querySelector('.viewer-status')!;
  this.diagnostic=this.root.querySelector('.viewer-diagnostics')!;
  this.root.querySelector('#viewer-close')!.addEventListener('click',()=>this.close(true));
  this.root.querySelector('#viewer-info')!.addEventListener('click',()=>this.artwork&&this.onInfo(this.artwork));
  this.root.querySelector('#viewer-diag')!.addEventListener('click',()=>this.setDiagnostics(this.diagnostic.hidden));
  this.root.querySelector('#original')!.addEventListener('click',()=>{const view=this.captureView();this.original=!this.original;this.mount(view);});
  this.root.querySelector('#zoom-in')!.addEventListener('click',()=>{this.viewer?.viewport.zoomBy(1.5);this.viewer?.viewport.applyConstraints();});
  for(const [id,delta] of [['previous-art',-1],['next-art',1]] as const)this.root.querySelector('#'+id)!.addEventListener('click',()=>{if(this.artwork){const index=this.collection.findIndex(a=>a.id===this.artwork!.id);this.open(this.collection[(index+delta+this.collection.length)%this.collection.length]);}});
  this.root.querySelector('#zoom-out')!.addEventListener('click',()=>{this.viewer?.viewport.zoomBy(1/1.5);this.viewer?.viewport.applyConstraints();});
  this.root.querySelector('#zoom-home')!.addEventListener('click',()=>this.viewer?.viewport.goHome());
  this.status.addEventListener('click',e=>{if((e.target as HTMLElement).closest('button'))this.mount(this.captureView());});
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.stage);this.resizeObserver.observe(this.root.querySelector('.viewer-header')!);this.resizeObserver.observe(this.root.querySelector('.viewer-footer')!);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!this.root.hidden){this.log('后台恢复');this.resize();this.viewer?.forceRedraw();}});
  window.addEventListener('orientationchange',()=>requestAnimationFrame(()=>this.resize()));
 }
 get isOpen(){return !this.root.hidden;}
 get state(){const view=this.captureView();return {activeViewers:this.viewer?1:0,pendingTiles:this.jobs.size,artwork:this.artwork?.id,source:this.original?'original':'detail',zoom:view?.zoom,center:view?[view.x,view.y]:undefined,viewport:[this.stage.clientWidth,this.stage.clientHeight],events:this.logs};}
 setDiagnostics(show:boolean){this.diagnostic.hidden=!show;this.updateDiagnostic();}
 private log(message:string){this.logs.push(`${new Date().toLocaleTimeString()} ${message}`);this.logs=this.logs.slice(-24);this.updateDiagnostic();}
 private updateDiagnostic(){if(!this.diagnostic.hidden)this.diagnostic.textContent=`漫览 v${VERSION}\n${JSON.stringify({...this.state,events:undefined},null,2)}\n${this.logs.join('\n')}`;}
 open(a:Artwork){if(!this.isOpen)this.lastFocus=document.activeElement as HTMLElement;this.artwork=a;this.original=false;this.root.hidden=false;this.onChange(true);this.mount();(this.root.querySelector('#viewer-close') as HTMLElement).focus();}
 close(resume=false){if(!this.isOpen)return;this.pendingView=null;this.destroy();this.root.hidden=true;this.log('关闭 / viewer 已销毁');this.lastFocus?.focus();this.onChange(false,resume);}
 private captureView():ArtworkView|null {
  if(!this.viewer?.world.getItemCount())return this.pendingView;
  const item=this.viewer.world.getItemAt(0),size=item.getContentSize();
  const center=item.viewportToImageCoordinates(this.viewer.viewport.getCenter(true),true);
  return {x:center.x/size.x,y:center.y/size.y,zoom:this.viewer.viewport.getZoom(true)};
 }
 private restoreView(view:ArtworkView){
  const viewer=this.viewer;if(!viewer?.world.getItemCount())return;
  const item=viewer.world.getItemAt(0),size=item.getContentSize();
  // Image fractions preserve the same subject even when source pixel dimensions differ.
  viewer.viewport.zoomTo(view.zoom,undefined,true);
  viewer.viewport.panTo(item.imageToViewportCoordinates(view.x*size.x,view.y*size.y,true),true);
  viewer.viewport.applyConstraints(true);
  viewer.navigator?.update(viewer.viewport);viewer.forceRedraw();
  this.log(`保留视野 / 缩放 ${viewer.viewport.getZoom(true).toFixed(3)} / 中心 ${view.x.toFixed(4)}, ${view.y.toFixed(4)}`);
 }
 private destroy(){this.generation++;clearTimeout(this.timer);for(const job of this.jobs){job.callback=()=>{};clearTimeout(job.jobId);job.abort();const image=job.userData.image;if(image){if(image.src.startsWith('blob:'))URL.revokeObjectURL(image.src);image.src='';}}this.jobs.clear();if(this.viewer){for(const event of ['open','tile-drawn','open-failed','tile-load-failed','animation-finish','resize'] as const)this.viewer.removeAllHandlers(event);this.viewer.destroy();this.viewer=null;}this.stage.replaceChildren();const map=this.root.querySelector('.viewer-map') as HTMLElement;map.hidden=true;map.innerHTML='<span>画幅位置</span><div id="artwork-map" class="viewer-map-viewport" title="点击或拖动小地图定位"></div>';}
 private viewMargins(){
  const stage=this.stage.getBoundingClientRect();
  const header=this.root.querySelector('.viewer-header')!.getBoundingClientRect();
  const footer=this.root.querySelector('.viewer-footer')!.getBoundingClientRect();
  return {left:12,right:12,top:Math.ceil(header.bottom-stage.top+8),bottom:Math.ceil(stage.bottom-footer.top+8)};
 }
 private resize(){
  if(!this.viewer||!this.stage.clientWidth||!this.stage.clientHeight)return;
  const viewport=this.viewer.viewport;
  const wasHome=Math.abs(viewport.getZoom()/viewport.getHomeZoom()-1)<.01 && viewport.getCenter().distanceTo(viewport.getHomeBounds().getCenter())<.01;
  viewport.setMargins(this.viewMargins());
  (viewport as unknown as {resize:(size:OpenSeadragon.Point,maintain:boolean)=>void}).resize(new OpenSeadragon.Point(this.stage.clientWidth,this.stage.clientHeight),true);
  if(wasHome)viewport.goHome(true);
  viewport.applyConstraints();this.viewer.navigator?.updateSize();this.viewer.forceRedraw();this.updateDiagnostic();
 }
 private fail(message:string){clearTimeout(this.timer);this.status.hidden=false;this.status.innerHTML='';const p=document.createElement('p');p.textContent=message;const b=document.createElement('button');b.textContent='重新加载';this.status.append(p,b);this.log(`错误: ${message}`);}
 private mount(view:ArtworkView|null=null){
  this.pendingView=view;
  this.destroy();const a=this.artwork;if(!a)return;
  const generation=this.generation;const source=this.original?a.original:a.detail;
  this.root.querySelector('#viewer-title')!.textContent=a.title;
  (this.root.querySelector('#viewer-title') as HTMLElement).title=`${this.original?'最高分辨率数字图像':'默认细看'} · ${source.width} × ${source.height} 像素`;
  const originalButton=this.root.querySelector('#original') as HTMLButtonElement;
  originalButton.hidden=!(a.hasOriginal && (a.original.width>a.detail.width || a.original.height>a.detail.height));
  originalButton.textContent=this.original?'返回细看':'查看原画';
  (this.root.querySelector('.viewer-map') as HTMLElement).hidden=false;
  this.status.hidden=false;this.status.textContent='正在载入高清瓦片…';
  // Canvas drawer only: keep individual tile surfaces small even for gigapixel originals.
  OpenSeadragon.pixelDensityRatio=1;
  const options: OpenSeadragon.Options & {drawer:string;tileRetryMax:number;tileRetryDelay:number}={element:this.stage, tileSources:source.dzi,drawer:'canvas',
    autoResize:false,showNavigationControl:false,showNavigator:true,navigatorId:'artwork-map',
    navigatorAutoFade:false,navigatorAutoResize:true,navigatorBackground:'#111811',navigatorDisplayRegionColor:'#f3d398',
    loadTilesWithAjax:true,maxImageCacheCount:100,imageLoaderLimit:4,
    timeout:15000,tileRetryMax:1,tileRetryDelay:750,maxZoomPixelRatio:1.5,
    visibilityRatio:.7,constrainDuringPan:true,animationTime:.3,blendTime:.15,
    gestureSettingsTouch:{pinchToZoom:true,flickEnabled:false,clickToZoom:false,dblClickToZoom:true},
    gestureSettingsMouse:{clickToZoom:false,dblClickToZoom:true,scrollToZoom:true},
    viewportMargins:this.viewMargins(),minZoomImageRatio:.8,homeFillsViewer:false,immediateRender:false};
  this.viewer=OpenSeadragon(options);
  this.log(`加载 ${a.id} ${source.dzi} / DPR=${OpenSeadragon.pixelDensityRatio}`);
  this.timer=window.setTimeout(()=>{if(generation===this.generation)this.fail('载入超时，请检查本地瓦片后重试。');},25000);
  const viewer=this.viewer;let firstTile=true;
  viewer.addHandler('open',()=>{if(generation!==this.generation)return;const source=viewer.world.getItemAt(0).source as unknown as {downloadTileStart:(job:TileJob)=>void};const start=source.downloadTileStart;source.downloadTileStart=(job)=>{this.jobs.add(job);const finish=job.finish;job.finish=(...args)=>{this.jobs.delete(job);finish.apply(job,args);const image=job.userData.image;if(image?.src.startsWith('blob:'))URL.revokeObjectURL(image.src);};start.call(source,job);};this.resize();if(this.pendingView)this.restoreView(this.pendingView);this.pendingView=null;this.log('DZI 打开成功');});
  viewer.addHandler('tile-drawn',()=>{if(generation!==this.generation)return;clearTimeout(this.timer);if(firstTile){firstTile=false;this.log('首张瓦片已绘制');}if(!this.status.querySelector('button'))this.status.hidden=true;});
  viewer.addHandler('open-failed',()=>{if(generation===this.generation)this.fail('无法打开高清图像，请重试。');});
  viewer.addHandler('tile-load-failed',(event)=>{if(generation===this.generation)this.fail(`部分瓦片加载失败：${(event as unknown as {message?:string}).message||'本地资源不可用'}`);});
  viewer.addHandler('animation-finish',()=>this.log(`缩放 ${viewer.viewport.getZoom().toFixed(3)}`));
  viewer.addHandler('resize',()=>this.updateDiagnostic());
 }
}
