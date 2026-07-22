// frontend/src/puzzle/usePuzzleDeepLinks.js
// Purpose: Mined-daily open state (with the "unplayed" dot), completion
// tracking, and the /puzzle, legacy /?puzzle, ?mined, and ?minedGame links.
// Imports From: ./minedPuzzleProgress.js (+ lazy ./minedPreview.js, ./minedGameLoader.js)
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getMinedPuzzleResult,
  minedPuzzleDay,
  recordMinedPuzzleResult,
} from './minedPuzzleProgress.js';
import { PRODUCT_EVENT, trackProductEvent } from '../analytics/productEvents.js';

export default function usePuzzleDeepLinks({ dismissOnboarding, setReviewGame }) {
  // The buttons wear a dot until today's mined puzzle has been completed.
  const [dailyPuzzle, setDailyPuzzle] = useState(null);
  const [puzzleStateBump, setPuzzleStateBump] = useState(0);
  const puzzleUnsolved = useMemo(() => {
    void puzzleStateBump;
    return !getMinedPuzzleResult(minedPuzzleDay());
  }, [puzzleStateBump]);

  const handleOpenPuzzle = useCallback(async () => {
    dismissOnboarding();
    const date = minedPuzzleDay();
    const mod = await import('./minedPreview.js');
    const puzzle = await mod.loadDailyMinedPuzzle(date);
    if (puzzle) {
      trackProductEvent(PRODUCT_EVENT.DAILY_OPENED, {
        date,
        moves: puzzle.recipe?.moves,
      });
      setDailyPuzzle(puzzle);
    }
  }, [dismissOnboarding]);

  const handleClosePuzzle = useCallback(() => {
    setDailyPuzzle(null);
    setMinedPreviewPuzzle(null);
    setPuzzleStateBump((n) => n + 1);
  }, []);

  const handlePuzzleComplete = useCallback((result = {}) => {
    if (!result.date) return;
    recordMinedPuzzleResult(result.date, result);
    trackProductEvent(PRODUCT_EVENT.DAILY_SOLVED, {
      date: result.date,
      moves: result.moves,
      score: result.score,
      grade: result.grade,
      outcome: result.totalCollapse ? 'collapsed' : 'completed',
    });
    setPuzzleStateBump((n) => n + 1);
  }, []);

  const [minedPreviewPuzzle, setMinedPreviewPuzzle] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('puzzle') !== null) {
      handleOpenPuzzle();
      return;
    }
    if (!import.meta.env.DEV) return;
    const m = params.get('mined');
    if (m !== null) {
      import('./minedPreview.js').then(async (mod) => {
        const p = await mod.loadMinedPreview(Number(m) || 0);
        if (p) setMinedPreviewPuzzle(p);
      });
      return;
    }
    const gm = params.get('minedGame');
    if (gm !== null) {
      import('./minedGameLoader.js').then(async (mod) => {
        const g = await mod.loadMinedGame(Number(gm) || 0);
        if (g) setReviewGame(g);
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    puzzleUnsolved,
    handleOpenPuzzle,
    handleClosePuzzle,
    handlePuzzleComplete,
    activePuzzle: minedPreviewPuzzle || dailyPuzzle,
  };
}
