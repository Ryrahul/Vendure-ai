/**
 * Normalize asset URLs returned by the Vendure API.
 * When ASSET_URL_PREFIX has no trailing slash, the API can return URLs like
 * "https://example.com/assetspreview/..." instead of "https://example.com/assets/preview/...".
 * This fixes that so product images load on the storefront.
 */
export function normalizeAssetUrl(url: string | null | undefined): string {
  if (url == null || url === '') return url ?? '';
  return url
    .replace(/assetspreview\//g, 'assets/preview/')
    .replace(/assetssource\//g, 'assets/source/');
}
