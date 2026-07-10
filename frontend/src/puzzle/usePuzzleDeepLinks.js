// frontend/src/puzzle/usePuzzleDeepLinks.js
// Purpose: Daily-puzzle open state (with the "unplayed" dot) and the URL
// deep links: /?puzzle opens today's daily (production — it's the share-card
// URL); ?puzzleDate / ?mined / ?minedGame are dev-only previews. Extracted
// from App.jsx.
// Imports From: ./puzzleProgress.js (+ lazy ./minedPreview.js, ./minedGameLoader.js)
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDayResult, todayStr } from './puzzleProgress.js';

export default function usePuzzleDeepLinks({ dismissOnboarding, setReviewGame }) {
  // Daily puzzle: the buttons wear a dot until today's is played. The bump
  // counter re-reads localStorage after the modal closes.
  const [dailyPuzzleOpen, setDailyPuzzleOpen] = useState(false);
  const [puzzleStateBump, setPuzzleStateBump] = useState(0);
  const puzzleUnsolved = useMemo(() => {
    void puzzleStateBump;
    try { return !getDayResult(todayStr()); } catch (_) { return false; }
  }, [puzzleStateBump]);
  const handleOpenPuzzle = useCallback(() => { setDailyPuzzleOpen(true); dismissOnboarding(); }, [dismissOnboarding]);
  const handleClosePuzzle = useCallback(() => { setDailyPuzzleOpen(false); setPuzzleStateBump((n) => n + 1); }, []);

  const [puzzlePreviewDate, setPuzzlePreviewDate] = useState(null);
  const [minedPreviewPuzzle, setMinedPreviewPuzzle] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('puzzle') !== null) {
      setDailyPuzzleOpen(true);
      return;
    }
    if (!import.meta.env.DEV) return;
    const d = params.get('puzzleDate');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setPuzzlePreviewDate(d);
      setDailyPuzzleOpen(true);
      return;
    }
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
    dailyPuzzleOpen,
    puzzleUnsolved,
    handleOpenPuzzle,
    handleClosePuzzle,
    puzzlePreviewDate,
    minedPreviewPuzzle,
    setMinedPreviewPuzzle,
  };
}
