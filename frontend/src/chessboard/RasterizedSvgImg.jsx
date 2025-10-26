// frontend/src/chessboard/RasterizedSvgImg.jsx
// Purpose: Render an SVG asset as a PNG <img> by rasterizing on the client with color CSS variables; caches results across sessions.
// Imports From: ./svgRasterizer.js
// Exported To: ./QuantumPiece.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { getRasterizedPng } from './svgRasterizer.js';

export default function RasterizedSvgImg({
  srcSvgUrl,
  cssVarMap = {},
  idPrefix = 'qsvg',
  size = 64,
  renderHint = 'precision',
  className,
  style,
  alt = '',
}) {
  const [pngUrl, setPngUrl] = useState('');

  const depSig = useMemo(() => JSON.stringify({ cssVarMap, srcSvgUrl, size, renderHint }), [cssVarMap, srcSvgUrl, size, renderHint]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const url = await getRasterizedPng({ srcUrl: srcSvgUrl, cssVarMap, idPrefix, size, renderHint });
        if (!cancelled) setPngUrl(url || '');
      } catch {
        if (!cancelled) setPngUrl('');
      }
    }
    if (srcSvgUrl && size > 0) run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depSig, idPrefix]);

  if (!pngUrl) return null;

  return (
    <img
      className={className || 'qc-rasterized-svg-img'}
      src={pngUrl}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      loading="eager"
      style={{ width: '100%', height: '100%', objectFit: 'contain', ...style }}
      aria-hidden={alt ? undefined : true}
    />
  );
}
