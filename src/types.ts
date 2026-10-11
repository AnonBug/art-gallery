export interface ImageAsset { url?: string; width: number; height: number; bytes?: number; dzi?: string }
export interface ArtworkStory {title:string;paragraphs:string[];sources:{label:string;url:string}[];checkedAt:string}
export interface Artwork {
 id:string; title:string; originalTitle:string; author:string; date:string; dimensions:string; medium:string;
 description:string; looking:string; source:string; originalUrl:string; license:string; credit:string;
 licenseStatus:string; collection:string; displayStatus:string; attribution?:string;
 sourceWidth:number; sourceHeight:number; variants:ImageAsset[]; detail:ImageAsset; original:ImageAsset;
 hasOriginal:boolean; wall:'north'|'south'|'east'|'west'; offset:number; height:number; centerY:number;
}
