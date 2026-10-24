// All scene lengths are metres. Catalogue dimensions describe the unframed work.
export const artworkFrameStyle={borderRatio:.11,minBorder:.04,maxBorder:.2};
export function artworkFrameBorder(width,height){
 return Math.max(artworkFrameStyle.minBorder,Math.min(artworkFrameStyle.maxBorder,Math.min(width,height)*artworkFrameStyle.borderRatio));
}
export function withPhysicalSize(artwork){
 const size=artwork.physicalSize;
 if(!size||![size.heightCm,size.widthCm].every(n=>Number.isFinite(n)&&n>0)||!size.source){
  throw new Error(`${artwork.id??'作品'} 缺少有效的原作尺寸及来源`);
 }
 const displayScale=artwork.displayScale??1;
 if(!Number.isFinite(displayScale)||displayScale<=0)throw new Error(`${artwork.id??'作品'} 展示倍率须为正数`);
 return {...artwork,displayScale,height:size.heightCm/100*displayScale,width:size.widthCm/100*displayScale};
}
export function defaultArtworkCenter({width,height}){
 // Keep small works at eye level and large frames above the 1.02 m dado rail.
 return Math.max(1.65,1.14+height/2+artworkFrameBorder(width,height));
}
