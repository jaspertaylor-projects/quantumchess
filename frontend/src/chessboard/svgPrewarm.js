// frontend/src/chessboard/svgPrewarm.js
// Purpose: Batch-style chess piece SVGs into data URLs and persist them to localStorage; exposes cache invalidation helpers.
// Imports From: ./assetsIndex.js, ./svgStyler.js, ../devlog.js
// Exported To: ../App.jsx

import { ALL_ASSET_URLS, SINGLE_ASSET_URLS } from './assetsIndex.js';
import { getStyledSvgUrl, clearSvgCaches } from './svgStyler.js';
import { devLog } from '../devlog.js';

async function prewarmSide(urls, sideName, cssVars) {
  const total = urls.length;
  let done = 0;
  devLog(`[Svg Prewarm] Start side:${sideName} total:${total}`);

  for (let i = 0; i < urls.length; i++) {
    const srcUrl = urls[i];
    try {
      await getStyledSvgUrl({ srcUrl, cssVarMap: cssVars, idPrefix: `prewarm-${sideName}-${i}` });
    } catch (err) {
      console.error('[Svg Prewarm] Error styling', { sideName, srcUrl }, err);
    }
    done += 1;
    if (done % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  devLog(`[Svg Prewarm] Done side:${sideName} completed:${done}/${total}`);
}

export async function prewarmAllPieceSvgs({ cssVarsBySide = { white: {}, black: {} } } = {}) {
  try {
    const urls = ALL_ASSET_URLS;
    devLog(`[Svg Prewarm] Preparing ${urls.length} assets for colors...`);
    await Promise.all([
      prewarmSide(urls, 'white', cssVarsBySide.white || {}),
      prewarmSide(urls, 'black', cssVarsBySide.black || {}),
    ]);
    devLog('[Svg Prewarm] Completed for all sides');
  } catch (err) {
    console.error('[Svg Prewarm] Failed', err);
  }
}

async function prewarmCapturedSide(urls, sideName, baseCssVars) {
  const capturedCss = {
    ...(baseCssVars || {}),
    ['--icon-color']: 'rgba(0,0,0,0)',
  };
  await prewarmSide(urls, `${sideName}-captured`, capturedCss);
}

export async function prewarmCapturedPieceSvgs({ cssVarsBySide = { white: {}, black: {} } } = {}) {
  try {
    const urls = SINGLE_ASSET_URLS;
    devLog(`[Svg Prewarm] Preparing captured-variant assets (${urls.length})...`);
    await Promise.all([
      prewarmCapturedSide(urls, 'white', cssVarsBySide.white || {}),
      prewarmCapturedSide(urls, 'black', cssVarsBySide.black || {}),
    ]);
    devLog('[Svg Prewarm] Completed captured-variant prewarm');
  } catch (err) {
    console.error('[Svg Prewarm] Failed captured-variant prewarm', err);
  }
}

export function invalidateSvgCaches(reason = 'manual') {
  devLog(`[Svg Prewarm] Invalidate caches reason:${reason}`);
  clearSvgCaches();
}

export default { prewarmAllPieceSvgs, prewarmCapturedPieceSvgs, invalidateSvgCaches };
