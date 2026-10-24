import {rooms} from './museum-layout.mjs';
import {assetPath} from './asset-path.mjs';
import {sculptures} from './sculpture-model';
import type {Artwork} from './types';

const descriptions:Record<string,string>={
 rembrandt:'让目光在明暗之间停留。从归来的拥抱到安静的肖像，走近伦勃朗笔下的人性与光。',
 market:'冬宫收藏的四幅市场画：鱼摊、水果摊、猎物摊与蔬菜摊。两面长墙相对陈列，以原作两倍的宽高，展开丰盛的日常。',
 leonardo:'十四件作品，从亲密肖像到宏大的《最后的晚餐》。两版《岩间圣母》并置，绘画与人体研究相映；沿南侧门洞继续进入雕塑区。',
 nefertiti:'蓝色王冠、修长的颈线与历经岁月的彩绘。绕行奈费尔提蒂王后像，在正面与侧影之间发现不同的神态。',
 sculpture:'一具低首蜷曲的身体，一块尚存凿痕的石头。绕行《蹲伏的男孩》，在不同角度中看见雕塑的张力。',
};
const covers:Record<string,string>={rembrandt:'/assets/artworks/prodigal/medium.webp',market:'/assets/artworks/snyders-fruit/medium.webp',leonardo:'/assets/artworks/leonardo-last-supper/medium.webp',sculpture:'/assets/sculptures/crouching-boy/poster.webp',nefertiti:'/assets/sculptures/nefertiti/poster.webp'};
export class HallBrowser {
 readonly root=document.createElement('section');private selected='rembrandt';private token=0;private cache=new Map<string,string>();private previousFocus:HTMLElement|null=null;
 constructor(private artworks:Artwork[],private capture:(id:string)=>Promise<string>,private onEnter:(id:string)=>void,private onChange:()=>void){
  this.root.className='hall-browser';this.root.hidden=true;this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','halls-title');
  this.root.innerHTML=`<div class="hall-shell"><header class="hall-heading"><a class="hall-brand" href="${import.meta.env.BASE_URL}">M <span>漫览 / MANLAN</span></a><button id="halls-close">返回漫游 ✕</button></header><div class="hall-intro"><div><span class="eyebrow">THE COLLECTION · 五个空间，一次漫览</span><h1 id="halls-title">切换展厅。</h1></div><p>选择展厅，预览空间。<br>前往后继续漫游。</p></div><nav class="hall-cards" aria-label="选择展厅">${rooms.map(r=>`<button class="hall-card" data-room="${r.id}" aria-pressed="${r.id===this.selected}" aria-label="预览${r.name}"><img src="${assetPath(covers[r.id],import.meta.env.BASE_URL)}" alt="" loading="lazy"><span class="hall-card-shade"></span><span class="hall-number">${r.number} / ${sculptures.some(s=>s.room===r.id)?'SCULPTURE':'PAINTINGS'}</span><span class="hall-card-copy"><strong>${r.name}</strong><small>${r.subtitle??r.artist}</small></span><span class="hall-card-arrow" aria-hidden="true">↗</span></button>`).join('')}</nav><div class="hall-detail"><div class="hall-preview"><img id="hall-preview-image" alt="" hidden><div id="hall-preview-status" role="status">正在准备展厅预览…</div><span class="hall-preview-label">空间预览 / SPACE PREVIEW</span></div><div class="hall-description"><span class="eyebrow" id="hall-selected-number"></span><h2 id="hall-selected-title"></h2><p id="hall-selected-description"></p><div id="hall-selected-count"></div><button id="hall-enter">前往展厅 <span aria-hidden="true">→</span></button><small>电脑 WASD 漫游 · 手机摇杆移动<br>五个展厅连通，也可随时切换</small></div></div><footer class="hall-bottom"><span>漫览数字画廊</span><span>绘画 · 雕塑 · 你的观看方式</span></footer></div>`;
  document.body.append(this.root);
  for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-room]'))button.addEventListener('click',()=>void this.select(button.dataset.room!,artworks));
  this.root.querySelector('#hall-enter')!.addEventListener('click',()=>{this.close();this.onEnter(this.selected);});
  this.root.querySelector('#halls-close')!.addEventListener('click',()=>this.close());
 }
 get isOpen(){return !this.root.hidden;}
 open(id?:string){if(id&&rooms.some(r=>r.id===id))this.selected=id;this.previousFocus=document.activeElement as HTMLElement;this.root.hidden=false;this.onChange();void this.select(this.selected,this.artworks);(this.root.querySelector(`[data-room="${this.selected}"]`) as HTMLElement).focus();}
 close(){if(!this.isOpen)return;this.token++;this.root.hidden=true;this.onChange();this.previousFocus?.focus();}
 private async select(id:string,artworks:Artwork[]){
  this.selected=id;const token=++this.token,r=rooms.find(r=>r.id===id)!;
  for(const button of this.root.querySelectorAll<HTMLButtonElement>('[data-room]'))button.setAttribute('aria-pressed',String(button.dataset.room===id));
  this.root.querySelector('#hall-selected-number')!.textContent=`第${({I:'一',II:'二',III:'三',IV:'四',V:'五'} as Record<string,string>)[r.number]}展厅 / ${id.toUpperCase()}`;
  this.root.querySelector('#hall-selected-title')!.textContent=r.name;this.root.querySelector('#hall-selected-description')!.textContent=descriptions[id];
  this.root.querySelector('#hall-selected-count')!.textContent=sculptures.some(s=>s.room===id)?'1 件雕塑 · 360° 交互细看':`${artworks.filter(a=>(a.room??'rembrandt')===id).length} 件作品 · 高清放大欣赏`;
  const image=this.root.querySelector('#hall-preview-image') as HTMLImageElement,status=this.root.querySelector('#hall-preview-status') as HTMLElement;image.hidden=true;status.hidden=false;status.textContent='正在准备展厅预览…';
  try{const preview=this.cache.get(id)??await this.capture(id);this.cache.set(id,preview);if(token!==this.token)return;image.src=preview;image.alt=`${r.name}3D展厅空间预览`;image.hidden=false;status.hidden=true;}
  catch{if(token!==this.token)return;status.replaceChildren();const text=document.createElement('p');text.textContent='预览暂时不可用，你仍可进入展厅。';const retry=document.createElement('button');retry.textContent='重试预览';retry.addEventListener('click',()=>void this.select(id,artworks));status.append(text,retry);}
 }
}
