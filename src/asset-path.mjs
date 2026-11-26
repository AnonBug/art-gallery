export const DEFAULT_ASSET_BASE_URL = 'https://halfbvg-art-assets.oss-cn-shanghai.aliyuncs.com/art-gallery/releases/835e10133392/';
// Vite's dev proxy avoids requiring localhost in the bucket's CORS rules.
export const ASSET_BASE_URL = import.meta.env?.DEV
 ? '/__gallery_assets/'
 : (import.meta.env?.VITE_ASSET_BASE_URL?.trim() || DEFAULT_ASSET_BASE_URL);

// Keep catalog paths portable and independent of the application's Pages base.
export function assetPath(url, base = ASSET_BASE_URL) {
 if (!url || !url.startsWith('/') || url.startsWith('//')) return url;
 return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}
export function artworkWithBase(artwork, base = ASSET_BASE_URL) {
 const resolve = asset => ({...asset, url:assetPath(asset.url,base), dzi:assetPath(asset.dzi,base)});
 return {...artwork, variants:artwork.variants.map(resolve), detail:resolve(artwork.detail)};
}
