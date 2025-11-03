// frontend/src/ai/useLocalAi.js
// Purpose: React hook that drives a local AI opponent using the alpha-beta engine, applying moves when it's the AI's turn.
// Imports From: ./alphaBetaEngine.js
// Exported To: ../App.jsx

import { useEffect, useRef } from 'react';
import pickBestMove from './alphaBetaEngine.js';

export default function useLocalAi({ enabled, aiSide, difficulty, pieces, sideToMove, canMakeMove, gameOver, onApplyMove }) {
  const thinkingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (gameOver) return;
    if (!canMakeMove) return;
    if (sideToMove !== aiSide) return;
    if (thinkingRef.current) return;

    thinkingRef.current = true;
    const id = setTimeout(() => {
      try {
        const mv = pickBestMove({ pieces, sideToMove: aiSide, difficulty });
        if (mv && typeof onApplyMove === 'function') {
          onApplyMove(mv, aiSide);
        }
      } catch (e) {
        // swallow errors to avoid breaking UI
      } finally {
        thinkingRef.current = false;
      }
    }, 50);

    return () => clearTimeout(id);
  }, [enabled, aiSide, difficulty, pieces, sideToMove, canMakeMove, gameOver, onApplyMove]);
}
