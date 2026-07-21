// frontend/src/review/socialReplayVideo.js
// Purpose: Turn the rendered replay board into a square, silent social video.
// The recorder deliberately captures only the board art, then adds stable
// Quantum Chess branding and move progress on canvas. No engine output,
// account controls, or private player data outside the replay is included.

import theme from '../theme.js';
import { fromAlgebraic } from '../chessboard/boardUtils.js';
import {
  SINGLE_ASSET_BY_TYPE,
  PAIR_ASSET_BY_KEY,
  QUANTUM_ASSET_BY_TYPE,
} from '../chessboard/assetsIndex.js';
import { getStyledSvgUrl } from '../chessboard/svgStyler.js';

export const REPLAY_PLY_INTERVAL_MS = 500;
export const SOCIAL_VIDEO_SIZE = 1080;

const MIME_CANDIDATES = [
  // MP4 is the most broadly accepted upload format on social platforms.
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
  { mimeType: 'video/mp4', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

export function selectReplayVideoFormat(MediaRecorderCtor = globalThis.MediaRecorder) {
  if (!MediaRecorderCtor) return null;
  const supports = typeof MediaRecorderCtor.isTypeSupported === 'function'
    ? (mime) => MediaRecorderCtor.isTypeSupported(mime)
    : () => true;
  return MIME_CANDIDATES.find(({ mimeType }) => supports(mimeType)) || null;
}

export function canMakeReplayVideo() {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  return Boolean(selectReplayVideoFormat() && typeof canvas.captureStream === 'function');
}

export function replayVideoFilename(game, extension = 'webm') {
  const opponent = String(game?.opponent || 'game')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'game';
  return `quantum-chess-vs-${opponent}.${extension}`;
}

const waitForImage = (image) => new Promise((resolve, reject) => {
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The replay frame could not be rendered.'));
});

function fitText(ctx, text, maxWidth, initialSize, weight = 700) {
  let size = initialSize;
  do {
    ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > 18);
  return size;
}

function pieceAssetUrls(piece) {
  const types = Array.isArray(piece?.possibleTypes) ? piece.possibleTypes : [];
  if (types.length === 1) return [SINGLE_ASSET_BY_TYPE[types[0]]].filter(Boolean);
  if (types.length === 2) {
    const key = [...types].sort().join('|');
    const pair = PAIR_ASSET_BY_KEY[key];
    if (pair) return [pair];
  }
  return types.map((type) => QUANTUM_ASSET_BY_TYPE[type]).filter(Boolean);
}

async function loadPieceImage(srcUrl, cssVars, imageCache) {
  const cacheKey = JSON.stringify([srcUrl, cssVars]);
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);
  const pending = getStyledSvgUrl({ srcUrl, cssVarMap: cssVars, idPrefix: `social-${imageCache.size}` })
    .then(async (styledUrl) => {
      if (!styledUrl) throw new Error('A piece image could not be prepared.');
      const image = new Image();
      image.src = styledUrl;
      await waitForImage(image);
      return image;
    });
  imageCache.set(cacheKey, pending);
  return pending;
}

function canvasSquareFor(square, orientation) {
  const parsed = fromAlgebraic(square);
  if (!parsed) return null;
  return orientation === 'black'
    ? { col: 7 - parsed.fileIndex, row: parsed.rankIndex }
    : { col: parsed.fileIndex, row: 7 - parsed.rankIndex };
}

async function drawReplayBoard({
  ctx,
  snapshot,
  orientation,
  squareColors,
  pieceSvgStyles,
  indicators,
  imageCache,
  x,
  y,
  size,
}) {
  const cell = size / 8;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 1 ? squareColors.dark : squareColors.light;
      ctx.fillRect(x + col * cell, y + row * cell, cell + 0.5, cell + 0.5);
    }
  }

  const lastMove = snapshot?.lastMove;
  for (const [square, color] of [[lastMove?.from, 'rgba(79,195,247,0.55)'], [lastMove?.to, 'rgba(246,196,69,0.55)']]) {
    const at = canvasSquareFor(square, orientation);
    if (!at) continue;
    ctx.fillStyle = color;
    ctx.fillRect(x + at.col * cell, y + at.row * cell, cell, cell);
  }

  const visiblePieces = (snapshot?.pieces || []).filter((piece) => !piece.captured && piece.square);
  await Promise.all(visiblePieces.map(async (piece) => {
    const at = canvasSquareFor(piece.square, orientation);
    if (!at) return;
    const urls = pieceAssetUrls(piece);
    const baseVars = pieceSvgStyles?.[piece.side] || {};
    const cssVars = urls.length > 1 && indicators?.typeIcons === false
      ? { ...baseVars, ['--icon-color']: 'rgba(0,0,0,0)' }
      : baseVars;
    const images = await Promise.all(urls.map((url) => loadPieceImage(url, cssVars, imageCache)));
    const px = x + at.col * cell;
    const py = y + at.row * cell;
    ctx.save();
    if (urls.length > 1 && piece.side !== orientation) {
      ctx.translate(px + cell / 2, py + cell / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-(px + cell / 2), -(py + cell / 2));
    }
    for (const image of images) ctx.drawImage(image, px + 2, py + 2, cell - 4, cell - 4);
    ctx.restore();

    if (piece.wasPromoted && indicators?.promoted !== false) {
      const ink = baseVars['--band-stroke'] || (piece.side === 'white' ? '#111827' : '#f2f2f2');
      ctx.fillStyle = ink;
      ctx.fillRect(px + cell * 0.345, py + cell * 0.92 + 2, cell * 0.31, Math.max(3, cell * 0.05));
    }
  }));

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);
}

function moveCaption(snapshot, ply, totalPlies) {
  if (ply === 0) return `Starting position · 0 / ${totalPlies}`;
  const move = snapshot?.lastMove;
  const notation = move?.from && move?.to ? `${move.from} → ${move.to}` : `Ply ${ply}`;
  return `${notation} · ${ply} / ${totalPlies}`;
}

export async function paintReplayVideoFrame({
  canvas,
  snapshot,
  ply,
  totalPlies,
  game,
  orientation = 'white',
  squareColors = { light: theme.boardLight, dark: theme.boardDark },
  pieceSvgStyles = { white: {}, black: {} },
  indicators = {},
  imageCache = new Map(),
}) {
  if (!canvas) throw new Error('The replay canvas is not ready.');
  const ctx = canvas.getContext('2d', { alpha: false });
  const size = SOCIAL_VIDEO_SIZE;
  const boardSize = 880;
  const boardX = (size - boardSize) / 2;
  const boardY = 112;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#080b14');
  gradient.addColorStop(0.55, '#111827');
  gradient.addColorStop(1, '#07131c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '900 34px Inter, system-ui, sans-serif';
  ctx.fillText('QUANTUM CHESS', boardX, 55);
  ctx.fillStyle = '#61dafb';
  ctx.fillRect(boardX, 82, boardSize, 3);

  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 26;
  await drawReplayBoard({
    ctx, snapshot, orientation, squareColors, pieceSvgStyles, indicators, imageCache,
    x: boardX, y: boardY, size: boardSize,
  });
  ctx.shadowBlur = 0;

  const opponent = game?.opponent ? `vs ${game.opponent}` : 'Saved game replay';
  fitText(ctx, opponent, 520, 27, 800);
  ctx.fillStyle = '#e7edf8';
  ctx.textAlign = 'left';
  ctx.fillText(opponent, boardX, 1033);

  const caption = moveCaption(snapshot, ply, totalPlies);
  fitText(ctx, caption, 420, 25, 700);
  ctx.fillStyle = '#9ca9c5';
  ctx.textAlign = 'right';
  ctx.fillText(caption, boardX + boardSize, 1033);
}

export function startReplayVideoRecorder(canvas) {
  const format = selectReplayVideoFormat();
  if (!format || typeof canvas?.captureStream !== 'function') {
    throw new Error('Video export is not supported by this browser. You can still play the replay on screen.');
  }
  const stream = canvas.captureStream(30);
  const chunks = [];
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 8_000_000,
  });
  const finished = new Promise((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onerror = () => reject(recorder.error || new Error('The replay video could not be recorded.'));
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: format.mimeType }));
    };
  });
  recorder.start(250);
  return { recorder, finished, format };
}

export function downloadReplayVideo(blob, game, extension) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = replayVideoFilename(game, extension);
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
