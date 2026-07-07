// frontend/src/chessboard/StyledSvgImg.jsx
// Purpose: Render an SVG asset as a scalable <img> with CSS variables dynamically injected; caches results across sessions.
// Imports From: ./svgStyler.js
// Exported To: ./QuantumPiece.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getStyledSvgUrl, getCachedSvgUrl } from './svgStyler.js';

export default function StyledSvgImg({
  srcSvgUrl,
  cssVarMap = {},
  idPrefix = 'qsvg',
  size = 64, // We still accept size for backwards compatibility of props, but we don't pass it to the styler
  className,
  style,
  alt = '',
}) {
  // Resolve synchronously from the cache when possible so an asset swap
  // (promotion, collapse to a new composite) paints on the first frame; the
  // async path only runs on a genuine cache miss, and we keep showing the
  // previous image until it resolves instead of flashing empty.
  const [svgUrl, setSvgUrl] = useState(() => getCachedSvgUrl({ srcUrl: srcSvgUrl, cssVarMap }));

  const depSig = useMemo(() => JSON.stringify({ cssVarMap, srcSvgUrl }), [cssVarMap, srcSvgUrl]);
  const lastResolvedSigRef = useRef(svgUrl ? depSig : null);

  useEffect(() => {
    if (lastResolvedSigRef.current === depSig && svgUrl) return;
    const cached = getCachedSvgUrl({ srcUrl: srcSvgUrl, cssVarMap });
    if (cached) {
      lastResolvedSigRef.current = depSig;
      if (cached !== svgUrl) setSvgUrl(cached);
      return;
    }
    let cancelled = false;
    async function run() {
      try {
        const url = await getStyledSvgUrl({ srcUrl: srcSvgUrl, cssVarMap, idPrefix });
        if (!cancelled && url) {
          lastResolvedSigRef.current = depSig;
          setSvgUrl(url);
        }
      } catch {
        // keep the previous image on failure
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
