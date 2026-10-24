// Artwork metadata stays portable; resolve local URLs at the application boundary.
export function assetPath(url, base = '/') {
 if (!url || !url.startsWith('/') || url.startsWith('//')) return url;
 return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}
export function artworkWithBase(artwork, base = '/') {
 const resolve = asset => ({...asset, url:assetPath(asset.url,base), dzi:assetPath(asset.dzi,base)});
 return {...artwork, variants:artwork.variants.map(resolve), detail:resolve(artwork.detail)};
}
