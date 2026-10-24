import './style.css';
import data from './data/artworks.json';
import storyData from './data/stories.json';
import {VERSION} from './data/theme';
import {Gallery} from './gallery';
import {ArtViewer} from './viewer';
import {joystickVector} from './navigation.mjs';
import {installRoamingZoomGuard} from './roaming-gestures.mjs';
import {artworkWithBase} from './asset-path.mjs';
import {HallBrowser} from './hall-browser';
import {SculptureViewer} from './sculpture-viewer';
import {type Sculpture} from './sculpture-model';
import {setOverlayInteractivity} from './overlay-interactivity.mjs';
import {appendArtworkStory} from './artwork-story';
import {withPhysicalSize} from './artwork-scale.mjs';
import type {Artwork,ArtworkStory} from './types';
const artworks=data.map(a=>artworkWithBase(withPhysicalSize(a),import.meta.env.BASE_URL)) as Artwork[];
const stories:Partial<Record<string,ArtworkStory>>=storyData;
const app=document.querySelector<HTMLElement>('#app')!;
app.innerHTML=`<main id="gallery"></main><div class="vignette"></div>
<header class="topbar"><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="漫览画廊"><span class="brand-icon">M</span><span>漫览<span class="brand-sub">数字画廊</span></span></a><div class="top-actions"><a class="github-link" href="https://github.com/AnonBug/art-gallery" target="_blank" rel="noopener noreferrer" title="GitHub 项目（在新标签页打开）" aria-label="查看 GitHub 项目（在新标签页打开）"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656"/></svg></a><button id="halls" title="预览与切换展厅">展厅</button><button id="reset" title="回到当前展厅的起始观赏位置">回到观赏点</button><button id="help" aria-label="操作帮助">?</button><button id="diagnostic-toggle" aria-pressed="false" title="开关诊断面板">诊断</button></div></header>
<div class="center-reticle" aria-hidden="true"></div>
<button id="enter-gallery" class="enter-gallery"><span>点击开始漫游</span><small>移动鼠标看向 · WASD 移动 · Esc 暂停</small></button>
<div class="joystick" aria-label="移动摇杆" role="group"><div class="joystick-ring"></div><div class="joystick-knob"></div><span>移动</span></div>
<span id="walk-status" class="visually-hidden" role="status">自由漫游 · 点击画作，驻足审视</span>
<pre id="diagnostics" hidden></pre>
<section class="info-overlay" id="info" hidden role="dialog" aria-modal="true" aria-labelledby="info-title"><div class="info-sheet"><button class="info-close" aria-label="关闭介绍">关闭 ✕</button><div id="info-content"></div></div></section>`;
const status=document.querySelector('#walk-status')!;
let diagnostics=false,hasEntered=false;
const info=document.querySelector('#info') as HTMLElement;
let previousFocus:HTMLElement|null=null;
let gallery:Gallery|undefined;
let hallBrowser:HallBrowser|undefined;
const sculptureViewer=new SculptureViewer((_open,resume=false)=>syncSuspension(resume),openSculptureInfo);
const viewer=new ArtViewer(openInfo,(_open,resume=false)=>syncSuspension(resume),artworks);
app.classList.add('is-roaming');
installRoamingZoomGuard(app,()=>!viewer.isOpen&&!sculptureViewer.isOpen&&!hallBrowser?.isOpen&&info.hidden);
try{
 gallery=new Gallery(document.querySelector('#gallery')!,artworks,()=>{},a=>viewer.open(a),openInfo,message=>{if(status.textContent!==message)status.textContent=message;if(message.includes('鼠标锁定'))document.querySelector('#enter-gallery small')!.textContent=message;},(locked,enabled)=>{
  if(locked){hasEntered=true;document.querySelector('#enter-gallery small')!.textContent='移动鼠标看向 · WASD 移动 · Esc 暂停';}
  app.classList.toggle('is-mouse-look',locked);app.classList.toggle('is-mouse-paused',enabled&&!locked);
  document.querySelector('#enter-gallery span')!.textContent=hasEntered?'点击继续漫游':'点击开始漫游';
  document.querySelectorAll<HTMLElement>('.topbar').forEach(element=>element.inert=locked);
 },()=>{},id=>void sculptureViewer.open(id),openSculptureInfo);
}catch(error){status.textContent='无法启动3D展厅，请检查浏览器的图形加速设置后刷新。';document.querySelector('#gallery')!.innerHTML='<div class="startup-error">3D展厅启动失败。请启用浏览器图形加速后刷新。</div>';console.error(error);}
hallBrowser=new HallBrowser(artworks,id=>gallery?gallery.preview(id):Promise.reject(new Error('WebGL unavailable')),id=>{gallery?.goToRoom(id);syncSuspension();gallery?.enter();},()=>syncSuspension());
function syncSuspension(resume=false){const roaming=!viewer.isOpen&&!sculptureViewer.isOpen&&!hallBrowser?.isOpen&&info.hidden;app.classList.toggle('is-roaming',roaming);setOverlayInteractivity(app,!roaming);viewer.root.inert=!info.hidden;sculptureViewer.root.inert=!info.hidden;gallery?.suspend(!roaming);resetStick();if(roaming&&resume)gallery?.resume();}
// The initial view is the gallery; the hall chooser opens only on request.
document.querySelector('#halls')!.addEventListener('click',()=>hallBrowser?.open(gallery?.state.room));
function openSculptureInfo(sculpture:Sculpture){
 const content=document.querySelector<HTMLElement>('#info-content')!;content.replaceChildren(el('span','雕塑档案 / SCULPTURE'),Object.assign(el('h2',sculpture.title),{id:'info-title'}),el('p',sculpture.author),el('p',sculpture.description));
 appendArtworkStory(content,stories[sculpture.id]);
 content.append(el('h3','看雕塑的线索'),el('p',sculpture.looking),el('h3','数字模型来源'),el('p',`${sculpture.credit}；${sculpture.modelNote}`),el('p',`模型许可：${sculpture.license}。扫描文件的许可与古代艺术品本身分别记录。`));
 for(const [title,url]of [['查看模型来源 ↗',sculpture.source],['查看模型许可 ↗',sculpture.licenseUrl]]){const link=el('a',title) as HTMLAnchorElement;link.href=url;link.target='_blank';link.rel='noopener noreferrer';content.append(link);}
 showInfo();
}
function el(tag:string,text:string){const element=document.createElement(tag);element.textContent=text;return element;}
function showInfo(){previousFocus=document.activeElement as HTMLElement;info.hidden=false;syncSuspension();(info.querySelector('.info-close') as HTMLButtonElement).focus();info.querySelector('.info-sheet')!.scrollTop=0;}
function openInfo(a:Artwork){
 const content=document.querySelector<HTMLElement>('#info-content')!;content.replaceChildren();content.append(el('span','作品档案 / ARTWORK'),Object.assign(el('h2',a.title),{id:'info-title'}),el('p',a.originalTitle));
 const img=document.createElement('img');img.src=a.variants[1].url!;img.alt=a.title;img.className='info-image';content.append(img,el('h3',`${a.author} · ${a.date}`),el('p',a.description));
 appendArtworkStory(content,stories[a.id]);
 content.append(el('h3','看画线索'),el('p',a.looking));
 const dl=document.createElement('dl');for(const [label,value] of [['收藏',a.collection],['陈列状态',a.displayStatus],['原作尺寸',a.dimensions],['材料',a.medium],['默认细看',`${a.detail.width} × ${a.detail.height} 像素 · ${((a.detail.bytes||0)/1e6).toFixed(2)} MB`],['图像署名',a.credit||'待确认'],['许可',a.licenseStatus]]){dl.append(el('dt',label),el('dd',value));}content.append(dl);
 const sizeLink=document.createElement('a');sizeLink.href=a.physicalSize.source;sizeLink.target='_blank';sizeLink.rel='noopener noreferrer';sizeLink.textContent='查看原作尺寸来源 ↗';content.append(sizeLink);
 if(a.licenseUrl){const licenseLink=document.createElement('a');licenseLink.href=a.licenseUrl;licenseLink.target='_blank';licenseLink.rel='noopener noreferrer';licenseLink.textContent='查看图像许可 ↗';content.append(licenseLink);}
 const scaleNote=(a.displayScale??1)===1?'展厅内画面按原作尺寸以 1:1 米制展示':`展厅内画面按原作宽、高各放大 ${a.displayScale} 倍展示（高 ${Number(a.height.toFixed(3))} × 宽 ${Number(a.width.toFixed(3))} 米），原作尺寸见上方记录`;
 const link=document.createElement('a');link.href=a.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='查看来源页面 ↗';content.append(link,el('p',`${scaleNote}；装饰画框为数字设计。高清细看支持滚轮或双指缩放、拖动查看画作细节。`));showInfo();
}
function genericInfo(title:string,paragraphs:string[]){const content=document.querySelector('#info-content')!;content.replaceChildren(el('span','漫览 / MANLAN'),Object.assign(el('h2',title),{id:'info-title'}),...paragraphs.map(p=>el('p',p)));showInfo();}
function closeInfo(resume=false){info.hidden=true;syncSuspension();previousFocus?.focus();if(resume)syncSuspension(true);}
info.querySelector('.info-close')!.addEventListener('click',()=>closeInfo(true));info.addEventListener('click',e=>{if(e.target===info)closeInfo(true);});
document.querySelector('#enter-gallery')!.addEventListener('click',()=>gallery?.enter());
document.querySelector('#help')!.addEventListener('click',()=>genericInfo('慢下来，看见更多。',['电脑：点击进入展厅后隐藏鼠标，上下左右移动鼠标看向，WASD 或方向键移动；屏幕中心既是视线中心，也是点击位置。按 Esc 显示鼠标并暂停漫游，再点展厅继续。手机：左下角摇杆移动，其余区域单指拖动转向。','五个展厅彼此连通：斯奈德斯厅—伦勃朗厅—达芬奇厅；进入达芬奇厅后向右转，依次通往米开朗基罗厅和图特摩斯厅（奈费尔提蒂王后像）。门口的半透明箭头只标示下一展厅；瞄准箭头点击，即可沿门洞走到该厅中央。也可用右上角“展厅”预览并直接进入任一展厅。回到观赏点会回到当前展厅的起始观赏位置。点击雕塑本体进入3D细看，可拖动旋转、缩放与平移；点击底座展签打开对应的作品介绍。','电脑用屏幕中心瞄准画作后点击，平滑走到作品前；到达后原地转头仍保持驻足审视，再次瞄准同一幅画点击即可打开高清细看。手机直接点击画作。','画框右下的小展签可打开中文介绍；高清看画时也可点“作品介绍”。展厅内双指不会缩放页面；进入高清看画后，滚轮或双指可缩放画作，拖动查看细节。','电脑看向地板出现光圈时，点击即可平滑走到该处；手机直接点按地板。途中可环顾或重选位置，按方向键、使用摇杆或拖动触屏可以停止。','行走会取消自动驻足；打开介绍或高清后自动显示鼠标。点击关闭返回展厅时直接恢复漫游；Esc 关闭最上层面板并保持暂停，再点展厅继续。诊断按钮显示版本、相机和瓦片状态。']));
document.querySelector('#reset')!.addEventListener('click',()=>gallery?.reset());
document.querySelector('#diagnostic-toggle')!.addEventListener('click',()=>{diagnostics=!diagnostics;(document.querySelector('#diagnostics') as HTMLElement).hidden=!diagnostics;viewer.setDiagnostics(diagnostics);document.querySelector('#diagnostic-toggle')!.setAttribute('aria-pressed',String(diagnostics));});
setInterval(()=>{if(diagnostics)document.querySelector('#diagnostics')!.textContent=`漫览 v${VERSION}\n${JSON.stringify(gallery?.state,null,2)}\n查看器 ${JSON.stringify(viewer.state,null,2)}`;},500);
// Independent pointer capture on the joystick keeps look, movement and artwork taps isolated.
const stick=document.querySelector('.joystick') as HTMLElement;const knob=stick.querySelector('.joystick-knob') as HTMLElement;let stickId:number|null=null;
function resetStick(){stickId=null;knob.style.transform='translate(-50%, -50%)';gallery?.setStick(0,0);}
function moveStick(e:PointerEvent){const r=stick.getBoundingClientRect();const v=joystickVector(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,38);knob.style.transform=`translate(calc(-50% + ${v.x*38}px), calc(-50% + ${v.y*38}px))`;gallery?.setStick(v.x,v.y);}
stick.addEventListener('pointerdown',e=>{if(stickId!==null||viewer.isOpen||sculptureViewer.isOpen||hallBrowser?.isOpen||!info.hidden)return;e.preventDefault();e.stopPropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId){e.preventDefault();e.stopPropagation();moveStick(e);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if((e as PointerEvent).pointerId===stickId)resetStick();});window.addEventListener('blur',resetStick);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(!info.hidden)closeInfo();else if(sculptureViewer.isOpen)sculptureViewer.close();else if(viewer.isOpen)viewer.close();else if(hallBrowser?.isOpen)hallBrowser.close();}
 if(e.key==='Tab'&&(!info.hidden||viewer.isOpen||sculptureViewer.isOpen||hallBrowser?.isOpen)){const modal=!info.hidden?info:sculptureViewer.isOpen?sculptureViewer.root:viewer.isOpen?viewer.root:hallBrowser!.root;const elements=Array.from(modal.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]')).filter(e=>e.offsetParent!==null);const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
// Read-only state exposed for repeatable diagnostics; no hidden navigation bypass.
Object.defineProperty(window,'__MANLAN__',{get:()=>({version:VERSION,gallery:gallery?.state,viewer:viewer.state,sculpture:sculptureViewer.state,halls:hallBrowser?.isOpen})});
syncSuspension();
