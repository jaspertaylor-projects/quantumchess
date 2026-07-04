// frontend/src/chessboard/StyledSvgImg.jsx
// Purpose: Render an SVG asset as a scalable <img> with CSS variables dynamically injected; caches results across sessions.
// Imports From: ./svgStyler.js
// Exported To: ./QuantumPiece.jsx

import React, { useEffect, useMemo, useState } from 'react';
import { getStyledSvgUrl } from './svgStyler.js';

export default function StyledSvgImg({
  srcSvgUrl,
  cssVarMap = {},
  idPrefix = 'qsvg',
  size = 64, // We still accept size for backwards compatibility of props, but we don't pass it to the styler
  className,
  style,
  alt = '',
}) {
  const [svgUrl, setSvgUrl] = useState('');

  const depSig = useMemo(() => JSON.stringify({ cssVarMap, srcSvgUrl }), [cssVarMap, srcSvgUrl]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const url = await getStyledSvgUrl({ srcUrl: srcSvgUrl, cssVarMap, idPrefix });
        if (!cancelled) setSvgUrl(url || '');
      } catch {
        if (!cancelled) setSvgUrl('');
      }
    }
    if (srcSvgUrl) run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depSig, idPrefix]);

  if (!svgUrl) return null;

  return (
    <img
      className={className || 'qc-styled-svg-img'}
      src={svgUrl}
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
