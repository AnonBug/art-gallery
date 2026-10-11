import './style.css';
import data from './data/artworks.json';
import storyData from './data/stories.json';
import {theme, VERSION} from './data/theme';
import {Gallery} from './gallery';
import {ArtViewer} from './viewer';
import {joystickVector} from './navigation.mjs';
import {installRoamingZoomGuard} from './roaming-gestures.mjs';
import {artworkWithBase} from './asset-path.mjs';
import type {Artwork,ArtworkStory} from './types';
const artworks=data.map(a=>artworkWithBase(a,import.meta.env.BASE_URL)) as Artwork[];
const stories:Partial<Record<string,ArtworkStory>>=storyData;
const app=document.querySelector('#app')!;
app.innerHTML=`<main id="gallery"></main><div class="vignette"></div>
<header class="topbar"><a class="brand" href="${import.meta.env.BASE_URL}" aria-label="漫览画廊首页"><span class="brand-icon">M</span><span>漫览<span class="brand-sub">数字画廊</span></span></a><span class="room-identity">${theme.museum} COLLECTION <i></i> ${theme.artist}</span><div class="top-actions"><button id="reset" title="回到展厅中央">回到中央</button><button id="help" aria-label="操作帮助">?</button><button id="diagnostic-toggle" aria-pressed="false" title="开关诊断面板">诊断</button></div></header>
<aside class="exhibit-intro"><span class="eyebrow">${theme.eyebrow}</span><h1>${theme.title}</h1><p>${theme.subtitle}</p><span class="fine-rule"></span><p class="intro-caption">${theme.tagline.join('<br>')}</p><button id="exhibition-info">关于本展 <span>↗</span></button></aside>
<div class="center-reticle" aria-hidden="true"></div>
<div class="current-work" hidden><span class="eyebrow" id="current-state">驻足审视</span><h2 id="current-title"></h2><div><button id="inspect">高清细看 ↗</button><button id="current-info">作品介绍</button></div></div>
<div class="joystick" aria-label="移动摇杆" role="group"><div class="joystick-ring"></div><div class="joystick-knob"></div><span>移动</span></div>
<footer class="bottom-ui"><div class="status-row"><span id="walk-status" role="status">自由漫游 · 点击画作，驻足审视</span><span class="desktop-hint">W A S D / 方向键移动 · 拖动转向</span><span class="mobile-hint">左侧摇杆移动 · 拖动转向</span></div><nav class="art-nav" aria-label="作品导航">${artworks.map((a,i)=>`<button data-id="${a.id}" aria-label="驻足审视：${a.title}"><span class="nav-number">${String(i+1).padStart(2,'0')}</span><img src="${a.variants[0].url}" alt="" draggable="false"><span>${a.title}</span></button>`).join('')}</nav><div class="footer-meta"><span>${theme.footer}</span><span>漫览 v${VERSION}</span></div></footer>
<pre id="diagnostics" hidden></pre>
<section class="info-overlay" id="info" hidden role="dialog" aria-modal="true" aria-labelledby="info-title"><div class="info-sheet"><button class="info-close" aria-label="关闭介绍">关闭 ✕</button><div id="info-content"></div></div></section>`;
const status=document.querySelector('#walk-status')!;
let current:Artwork|null=null,arrived=false,diagnostics=false;
const info=document.querySelector('#info') as HTMLElement;
let previousFocus:HTMLElement|null=null;
let gallery:Gallery;
const viewer=new ArtViewer(openInfo,()=>syncSuspension(),artworks);
app.classList.add('is-roaming');
installRoamingZoomGuard(app,()=>!viewer.isOpen&&info.hidden);
try{
 gallery=new Gallery(document.querySelector('#gallery')!,artworks,(a,ready,moving)=>{
  current=a;arrived=ready;const panel=document.querySelector('.current-work') as HTMLElement;panel.hidden=false;
  document.querySelector('#current-title')!.textContent=a.title;document.querySelector('#current-state')!.textContent=ready?'驻足审视 / PAUSE & LOOK':moving?'正在走近 / APPROACHING':'自由漫游 / EXPLORING';
  (document.querySelector('#inspect') as HTMLButtonElement).disabled=!ready;
  document.querySelectorAll('.art-nav button').forEach(b=>{const selected=(b as HTMLElement).dataset.id===a.id;b.classList.toggle('active',selected);b.setAttribute('aria-current',selected?'true':'false');});
 },a=>viewer.open(a),openInfo,message=>{if(status.textContent!==message)status.textContent=message;});
}catch(error){status.textContent='无法启动3D展厅，请检查浏览器的图形加速设置后刷新。';document.querySelector('#gallery')!.innerHTML='<div class="startup-error">3D展厅启动失败。请启用浏览器图形加速后刷新。</div>';console.error(error);}
function syncSuspension(){const roaming=!viewer.isOpen&&info.hidden;app.classList.toggle('is-roaming',roaming);gallery?.suspend(!roaming);resetStick();}
function el(tag:string,text:string){const element=document.createElement(tag);element.textContent=text;return element;}
function showInfo(){previousFocus=document.activeElement as HTMLElement;info.hidden=false;syncSuspension();(info.querySelector('.info-close') as HTMLButtonElement).focus();info.querySelector('.info-sheet')!.scrollTop=0;}
function openInfo(a:Artwork){
 const content=document.querySelector('#info-content')!;content.replaceChildren();content.append(el('span','作品档案 / ARTWORK'),Object.assign(el('h2',a.title),{id:'info-title'}),el('p',a.originalTitle));
 const img=document.createElement('img');img.src=a.variants[1].url!;img.alt=a.title;img.className='info-image';content.append(img,el('h3',`${a.author} · ${a.date}`),el('p',a.description));
 const story=stories[a.id];
 if(story){
  const section=document.createElement('section');section.className='artwork-story';section.setAttribute('aria-labelledby','story-title');
  section.append(Object.assign(el('h3','背景故事'),{id:'story-title'}),el('h4',story.title),...story.paragraphs.map(p=>el('p',p)));
  const references=document.createElement('details');references.className='story-references';
  references.append(el('summary','资料来源与延伸阅读'),el('small',`资料核查：${story.checkedAt}`));
  const list=document.createElement('ul');
  for(const source of story.sources){const item=document.createElement('li'),link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.label+' ↗';item.append(link);list.append(item);}
  references.append(list);section.append(references);content.append(section);
 }
 content.append(el('h3','看画线索'),el('p',a.looking));
 const dl=document.createElement('dl');for(const [label,value] of [['收藏',a.collection],['陈列状态',a.displayStatus],['原作尺寸',a.dimensions],['材料',a.medium],['默认细看',`${a.detail.width} × ${a.detail.height} 像素 · ${((a.detail.bytes||0)/1e6).toFixed(2)} MB`],['所得最高分辨率',`${a.original.width} × ${a.original.height} 像素`],['图像署名',a.credit||'待确认'],['许可',a.licenseStatus]]){dl.append(el('dt',label),el('dd',value));}content.append(dl);
 const link=document.createElement('a');link.href=a.source;link.target='_blank';link.rel='noopener noreferrer';link.textContent='查看来源页面 ↗';content.append(link,el('p','“原画”指本项目所获得的最高分辨率数字图像。未取得更大的版本时，仅提供默认细看；不代表实体原作。'));showInfo();
}
function genericInfo(title:string,paragraphs:string[]){const content=document.querySelector('#info-content')!;content.replaceChildren(el('span','漫览 / MANLAN'),Object.assign(el('h2',title),{id:'info-title'}),...paragraphs.map(p=>el('p',p)));showInfo();}
function closeInfo(){info.hidden=true;syncSuspension();previousFocus?.focus();}
info.querySelector('.info-close')!.addEventListener('click',closeInfo);info.addEventListener('click',e=>{if(e.target===info)closeInfo();});
document.querySelector('#help')!.addEventListener('click',()=>genericInfo('慢下来，看见更多。',['电脑：WASD 或方向键移动，按住画面拖动转向。手机：左下角摇杆移动，其余区域单指拖动转向。','第一次点击画面，平滑走到作品前；到达后再点同一画面，打开高清瓦片。底部作品标签可直接驻足。','画框右下的小展签可打开中文介绍；高清看画时也可点“作品介绍”。展厅内双指不会缩放页面；进入高清看画后，滚轮或双指可缩放画作，拖动查看细节。','移动或拖动会取消自动行走；Esc 关闭最上层面板。诊断按钮显示版本、相机和瓦片状态。']));
document.querySelector('#exhibition-info')!.addEventListener('click',()=>genericInfo('光与归途',[`本展精选 ${artworks.length} 幅${theme.artist}相关馆藏，以光影串联叙事画和肖像。`,theme.note,...theme.about]));
document.querySelector('#reset')!.addEventListener('click',()=>{gallery?.reset();current=null;arrived=false;(document.querySelector('.current-work') as HTMLElement).hidden=true;document.querySelectorAll('.art-nav button').forEach(b=>b.classList.remove('active'));});
document.querySelectorAll<HTMLButtonElement>('.art-nav button').forEach(b=>b.addEventListener('click',()=>gallery?.focus(b.dataset.id!)));
document.querySelector('#inspect')!.addEventListener('click',()=>{if(current&&arrived)viewer.open(current);});
document.querySelector('#current-info')!.addEventListener('click',()=>current&&openInfo(current));
document.querySelector('#diagnostic-toggle')!.addEventListener('click',()=>{diagnostics=!diagnostics;(document.querySelector('#diagnostics') as HTMLElement).hidden=!diagnostics;viewer.setDiagnostics(diagnostics);document.querySelector('#diagnostic-toggle')!.setAttribute('aria-pressed',String(diagnostics));});
setInterval(()=>{if(diagnostics)document.querySelector('#diagnostics')!.textContent=`漫览 v${VERSION}\n${JSON.stringify(gallery?.state,null,2)}\n查看器 ${JSON.stringify(viewer.state,null,2)}`;},500);
// Independent pointer capture on the joystick keeps look, movement and artwork taps isolated.
const stick=document.querySelector('.joystick') as HTMLElement;const knob=stick.querySelector('.joystick-knob') as HTMLElement;let stickId:number|null=null;
function resetStick(){stickId=null;knob.style.transform='translate(-50%, -50%)';gallery?.setStick(0,0);}
function moveStick(e:PointerEvent){const r=stick.getBoundingClientRect();const v=joystickVector(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2,38);knob.style.transform=`translate(calc(-50% + ${v.x*38}px), calc(-50% + ${v.y*38}px))`;gallery?.setStick(v.x,v.y);}
stick.addEventListener('pointerdown',e=>{if(stickId!==null||viewer.isOpen||!info.hidden)return;e.preventDefault();e.stopPropagation();stickId=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickId){e.preventDefault();e.stopPropagation();moveStick(e);}});
for(const event of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(event,e=>{if((e as PointerEvent).pointerId===stickId)resetStick();});window.addEventListener('blur',resetStick);
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){if(!info.hidden)closeInfo();else if(viewer.isOpen)viewer.close();}
 if(e.key==='Tab'&&(!info.hidden||viewer.isOpen)){const modal=!info.hidden?info:viewer.root;const elements=Array.from(modal.querySelectorAll<HTMLElement>('button:not([hidden]), a[href]')).filter(e=>e.offsetParent!==null);const first=elements[0],last=elements.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
// Read-only state exposed for repeatable diagnostics; no hidden navigation bypass.
Object.defineProperty(window,'__MANLAN__',{get:()=>({version:VERSION,gallery:gallery?.state,viewer:viewer.state})});
