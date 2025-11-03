// frontend/src/chessboard/rasterPrewarm.js
// Purpose: Batch-rasterize chess piece SVGs into PNG data URLs at a fixed 512x512 base and persist them to localStorage; exposes cache invalidation helpers with console confirmations.
// Imports From: ./assetsIndex.js, ./svgRasterizer.js
// Exported To: ../App.jsx

import { ALL_ASSET_URLS, SINGLE_ASSET_URLS } from './assetsIndex.js';
import { getRasterizedPng, clearRasterCaches } from './svgRasterizer.js';

const RASTER_BASE_SIZE = 512;

function uniqueSizes() {
  // Always prewarm the single raster base size regardless of requested sizes
  return [RASTER_BASE_SIZE];
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
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }

  console.log(`[Raster Prewarm] Done side:${sideName} completed:${done}/${total}`);
}

export async function prewarmAllPiecePngs({ cssVarsBySide = { white: {}, black: {} }, sizes = [RASTER_BASE_SIZE], renderHint = 'precision' } = {}) {
  try {
    const urls = ALL_ASSET_URLS;
    console.log(`[Raster Prewarm] Preparing ${urls.length} assets for colors at base size ${RASTER_BASE_SIZE}...`);
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

export async function prewarmCapturedPiecePngs({ cssVarsBySide = { white: {}, black: {} }, sizes = [RASTER_BASE_SIZE], renderHint = 'crisp' } = {}) {
  try {
    const urls = SINGLE_ASSET_URLS;
    console.log(`[Raster Prewarm] Preparing captured-variant assets (${urls.length}) at base size ${RASTER_BASE_SIZE}...`);
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
