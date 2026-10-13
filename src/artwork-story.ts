import type {ArtworkStory} from './types';

/** Shared story section for paintings and sculpture inside the information dialog. */
export function appendArtworkStory(content:HTMLElement,story?:ArtworkStory){
 if(!story)return;
 const text=(tag:string,value:string)=>{const element=document.createElement(tag);element.textContent=value;return element;};
 const section=document.createElement('section');section.className='artwork-story';section.setAttribute('aria-labelledby','story-title');
 section.append(Object.assign(text('h3','背景故事'),{id:'story-title'}),text('h4',story.title),...story.paragraphs.map(p=>text('p',p)));
 const references=document.createElement('details');references.className='story-references';
 references.append(text('summary','资料来源与延伸阅读'),text('small',`资料核查：${story.checkedAt}`));
 const list=document.createElement('ul');
 for(const source of story.sources){const item=document.createElement('li'),link=document.createElement('a');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=source.label+' ↗';item.append(link);list.append(item);}
 references.append(list);section.append(references);content.append(section);
}
