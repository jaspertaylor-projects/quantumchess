// frontend/src/ads/PuzzleDisplayAd.jsx
// Purpose: A policy-separated AdSense display unit for the completed daily
// puzzle card. It is not an H5 adBreak placement and remains completely
// absent for ad-free users and unconfigured builds.

import React, { useEffect, useRef } from 'react';
import { puzzleDisplayAdConfig } from './adService.js';
import './PuzzleDisplayAd.css';

export default function PuzzleDisplayAd({ enabled = false }) {
  const requestedRef = useRef(false);
  const config = enabled ? puzzleDisplayAdConfig() : null;

  useEffect(() => {
    if (!config || requestedRef.current || typeof window === 'undefined') return;
    requestedRef.current = true;
    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch (_) {
      // A blocked/unfilled display unit simply leaves its reserved region.
    }
  }, [config]);

  if (!config) return null;
  return (
    <aside className="qc-puzzle-display-ad" aria-label="Advertisement">
      <div className="qc-puzzle-display-ad-label">Advertisement</div>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', width: '100%', minHeight: 90 }}
        data-ad-client={config.client}
        data-ad-slot={config.slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
        {...(config.testMode ? { 'data-adtest': 'on' } : {})}
      />
    </aside>
  );
}
