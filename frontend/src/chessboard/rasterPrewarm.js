// frontend/src/chessboard/rasterPrewarm.js
// Purpose: Batch-rasterize all chess piece SVGs into PNG data URLs for given colors/sizes and persist them to localStorage; exposes cache invalidation helpers with console confirmations. Also supports a captured-piece variant with transparent icon color for compact displays.
// Imports From: ./assetsIndex.js, ./svgRasterizer.js
// Exported To: ../App.jsx

import { ALL_ASSET_URLS, SINGLE_ASSET_URLS } from './assetsIndex.js';
import { getRasterizedPng, clearRasterCaches } from './svgRasterizer.js';

function uniqueSizes(sizes) {
  const arr = (Array.isArray(sizes) ? sizes : []).filter((n) => Number.isFinite(n) && n > 0);
  const set = new Set(arr.map((n) => Math.round(n)));
  // Always include a sensible default
  set.add(64);
  return Array.from(set).sort((a, b) => a - b);
}

async function prewarmSide(urls, sideName, cssVars, sizes, renderHint = 'precision') {
  const sizesList = uniqueSizes(sizes);
  const total = urls.length * sizesList.length;
  let done = 0;
  console.log(`[Raster Prewarm] Start side:${sideName} total:${total} sizes:[${sizesList.join(', ')}]`);

  for (const size of sizesList) {
    for (let i = 0; i < urls.length; i++) {
      const srcUrl = urls[i];
      try {
        await getRasterizedPng({ srcUrl, cssVarMap: cssVars, idPrefix: `prewarm-${sideName}-${i}`, size, renderHint });
      } catch (err) {
        console.error('[Raster Prewarm] Error rasterizing', { sideName, srcUrl, size }, err);
      }
      done += 1;
      if (done % 10 === 0) {
        // yield to UI occasionally
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  console.log(`[Raster Prewarm] Done side:${sideName} completed:${done}/${total}`);
}

export async function prewarmAllPiecePngs({ cssVarsBySide = { white: {}, black: {} }, sizes = [64], renderHint = 'precision' } = {}) {
  try {
    const urls = ALL_ASSET_URLS;
    console.log(`[Raster Prewarm] Preparing ${urls.length} assets for colors + sizes...`);
    await Promise.all([
      prewarmSide(urls, 'white', cssVarsBySide.white || {}, sizes, renderHint),
      prewarmSide(urls, 'black', cssVarsBySide.black || {}, sizes, renderHint),
    ]);
    console.log('[Raster Prewarm] Completed for all sides');
  } catch (err) {
    console.error('[Raster Prewarm] Failed', err);
  }
}

async function prewarmCapturedSide(urls, sideName, baseCssVars, sizes, renderHint = 'crisp') {
  const capturedCss = {
    ...(baseCssVars || {}),
    ['--icon-color']: 'rgba(0,0,0,0)',
  };
  await prewarmSide(urls, `${sideName}-captured`, capturedCss, sizes, renderHint);
}

export async function prewarmCapturedPiecePngs({ cssVarsBySide = { white: {}, black: {} }, sizes = [26], renderHint = 'crisp' } = {}) {
  try {
    const urls = SINGLE_ASSET_URLS;
    console.log(`[Raster Prewarm] Preparing captured-variant assets (${urls.length}) for sizes [${uniqueSizes(sizes).join(', ')}]...`);
    await Promise.all([
      prewarmCapturedSide(urls, 'white', cssVarsBySide.white || {}, sizes, renderHint),
      prewarmCapturedSide(urls, 'black', cssVarsBySide.black || {}, sizes, renderHint),
    ]);
    console.log('[Raster Prewarm] Completed captured-variant prewarm');
  } catch (err) {
    console.error('[Raster Prewarm] Failed captured-variant prewarm', err);
  }
}

export function invalidateRasterPngs(reason = 'manual') {
  console.log(`[Raster Prewarm] Invalidate caches reason:${reason}`);
  clearRasterCaches();
}

export default { prewarmAllPiecePngs, prewarmCapturedPiecePngs, invalidateRasterPngs }; 
