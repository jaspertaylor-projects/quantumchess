// frontend/src/hooks/useTimelineNav.js
// Purpose: Move-history navigation — maps the engine timeline's viewIndex to
// a selected move index, seeks on request, and steps with the left/right
// arrow keys. Extracted from App.jsx.
// Imports From: None
// Exported To: ../App.jsx

import { useCallback, useEffect, useMemo } from 'react';

export default function useTimelineNav({ moves, viewIndex, historyLength, setViewIndex, clearSelection }) {
  // Map timeline viewIndex to the currently selected move index (-1 means
  // before any moves).
  const currentMoveIndex = useMemo(() => {
    const idx = viewIndex - 1;
    const capped = Math.min(moves.length - 1, Math.max(-1, idx));
    return Number.isFinite(capped) ? capped : -1;
  }, [viewIndex, moves.length]);

  const handleSeekToIndex = useCallback((moveIndex) => {
    clearSelection();
    if (typeof moveIndex !== 'number') return;
    if (moveIndex < 0) {
      setViewIndex(0);
    } else {
      const snapIndex = Math.max(0, Math.min(historyLength - 1, moveIndex + 1));
      setViewIndex(snapIndex);
    }
  }, [historyLength, setViewIndex, clearSelection]);

  // Keyboard navigation: left/right arrows step through move history.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (!e) return;
      const key = e.key;
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target;
      if (target) {
        const tag = (target.tagName || '').toLowerCase();
        const editable = target.isContentEditable === true;
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) {
          return;
        }
      }
      e.preventDefault();

      const total = moves.length;
      const curr = currentMoveIndex;
      let nextIdx = curr;
      if (key === 'ArrowLeft') {
        nextIdx = Math.max(-1, curr - 1);
      } else if (key === 'ArrowRight') {
        nextIdx = Math.min(total - 1, curr + 1);
      }
      if (nextIdx === curr) return;

      clearSelection();
      const snapIndex = Math.max(0, Math.min(historyLength - 1, nextIdx + 1));
      setViewIndex(snapIndex);
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentMoveIndex, moves.length, historyLength, setViewIndex, clearSelection]);

  return { currentMoveIndex, handleSeekToIndex };
}
