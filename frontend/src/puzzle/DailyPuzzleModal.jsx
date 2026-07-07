// frontend/src/puzzle/DailyPuzzleModal.jsx
// Purpose: The daily puzzle: one seeded quantum puzzle per local day, played
// on a mini board with three attempts. Multi-move puzzles walk a chain of
// sub-goals with scripted Black replies between steps. Solving (or failing)
// records the day, feeds the streak, and offers a Wordle-style share card.
// Imports From: ../theme.js, ../tutorial/MiniBoard.jsx, ./puzzleGenerator.js,
//   ./puzzleProgress.js, ../chessboard/quantumEngine.js
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import { X as XIcon, Share2 as ShareIcon, Puzzle as PuzzleIcon } from 'lucide-react';
import MiniBoard from '../tutorial/MiniBoard.jsx';
import { canPieceRecohere, listCheckThreats } from '../chessboard/quantumEngine.js';
import { enumerateWhiteMoves, checkPuzzleMove } from './puzzleGenerator.js';
import {
  MAX_ATTEMPTS, todayStr, msUntilTomorrow, loadOrGeneratePuzzle,
  getDayResult, recordDayResult, getStreak, buildShareText,
} from './puzzleProgress.js';

function useCountdown() {
  const [ms, setMs] = useState(msUntilTomorrow());
  useEffect(() => {
    const id = setInterval(() => setMs(msUntilTomorrow()), 30000);
    return () => clearInterval(id);
  }, []);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// previewDate (dev tool): load a specific date's puzzle in practice mode —
// nothing is recorded and the streak is untouched.
export default function DailyPuzzleModal({ open = false, onClose = () => {}, svgStyleBySide = null, previewDate = null }) {
  const [puzzle, setPuzzle] = useState(null);
  const [phase, setPhase] = useState('loading'); // loading | playing | done
  const [plyIdx, setPlyIdx] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [display, setDisplay] = useState(null); // pieces currently shown
  const [marks, setMarks] = useState([]);
  const [selectedSq, setSelectedSq] = useState(null);
  const [banner, setBanner] = useState(null); // { kind: 'bad'|'good'|'info', text }
  const [result, setResult] = useState(null); // { solved, tries }
  const [revealArrow, setRevealArrow] = useState(null);
  const [copied, setCopied] = useState(false);
  const timersRef = useRef([]);
  const countdown = useCountdown();

  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };

  // Load / generate on open.
  useEffect(() => {
    if (!open) return undefined;
    setPhase('loading');
    setPuzzle(null);
    setBanner(null);
    setRevealArrow(null);
    setSelectedSq(null);
    setMarks([]);
    setCopied(false);
    const t = setTimeout(() => {
      const date = previewDate || todayStr();
      const p = loadOrGeneratePuzzle(date);
      if (!p) { setBanner({ kind: 'bad', text: 'Could not prepare a puzzle — try reloading.' }); return; }
      setPuzzle(p);
      const prior = previewDate ? null : getDayResult(date);
      if (prior) {
        setResult(prior);
        setPlyIdx(p.plies.length - 1);
        setDisplay(p.plies[p.plies.length - 1].solutionAfter);
        setMarks(p.plies[p.plies.length - 1].solutionMeasured || []);
        setPhase('done');
      } else {
        setResult(null);
        setPlyIdx(0);
        setAttempts(0);
        setDisplay(p.plies[0].pieces);
        setPhase('playing');
      }
    }, 30);
    return () => {
      clearTimeout(t);
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [open]);

  const ply = puzzle && puzzle.plies[plyIdx];
  const live = useMemo(() => (display || []).filter((p) => !p.captured && p.square), [display]);
  // Threat arrows/rings are shown only on move RESULTS — drawing them on the
  // rest position would literally point at the solution.
  const atRest = Boolean(ply && display === ply.pieces && phase === 'playing');
  const threats = useMemo(
    () => (display && !atRest ? listCheckThreats(display) : []),
    [display, atRest]
  );

  const selected = selectedSq ? live.find((p) => p.side === 'white' && p.square === selectedSq) : null;
  const targets = useMemo(() => {
    if (!selected || phase !== 'playing' || !ply) return [];
    const moves = enumerateWhiteMoves(ply.pieces, ply.lastMove || null);
    return Array.from(new Set(moves.filter((m) => m.from === selected.square).map((m) => m.to)));
  }, [selected, phase, ply]);

  const finish = (solved, tries) => {
    const r = { solved, tries };
    if (!previewDate) recordDayResult(puzzle.date, r);
    setResult(r);
    setPhase('done');
  };

  const handleSquareClick = (alg) => {
    if (phase !== 'playing' || !ply) return;
    const pc = live.find((p) => p.square === alg);
    if (pc && pc.side === 'white') { setSelectedSq(alg); setBanner(null); return; }
    if (!selected) return;

    const { correct, move } = checkPuzzleMove(puzzle, plyIdx, selected.square, alg);
    setSelectedSq(null);
    if (!move) return; // not a legal destination — ignore the click

    if (correct) {
      setDisplay(move.after);
      setMarks(move.measuredSquares || []);
      const isLast = plyIdx === puzzle.plies.length - 1;
      if (isLast) {
        setBanner({ kind: 'good', text: '✓ ' + successLine(puzzle) });
        finish(true, attempts + 1);
      } else {
        setBanner({ kind: 'info', text: 'Yes. Black replies…' });
        later(() => {
          setDisplay(puzzle.plies[plyIdx + 1].pieces);
          setMarks([]);
          setPlyIdx(plyIdx + 1);
          setBanner(null);
        }, 1100);
      }
      return;
    }

    // Wrong (but legal): burn an attempt, show the consequence briefly,
    // then reset the current step.
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);
    setDisplay(move.after);
    setMarks(move.measuredSquares || []);
    if (nextAttempts >= MAX_ATTEMPTS) {
      setBanner({ kind: 'bad', text: `Out of attempts. The move was ${ply.solution.from} → ${ply.solution.to}${ply.solution.enPassant ? ' (en passant)' : ''}.` });
      later(() => {
        setDisplay(ply.solutionAfter);
        setMarks(ply.solutionMeasured || []);
        setRevealArrow({ from: ply.solution.from, to: ply.solution.to });
        finish(false, nextAttempts);
      }, 900);
    } else {
      setBanner({ kind: 'bad', text: `Legal — but not the idea. ${MAX_ATTEMPTS - nextAttempts} ${MAX_ATTEMPTS - nextAttempts === 1 ? 'try' : 'tries'} left.` });
      later(() => {
        setDisplay(ply.pieces);
        setMarks([]);
        setBanner(null);
      }, 1200);
    }
  };

  const handleShare = async () => {
    if (!puzzle || !result) return;
    const text = buildShareText(puzzle, result, getStreak());
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      later(() => setCopied(false), 2000);
    } catch (_) {
      setBanner({ kind: 'info', text });
    }
  };

  if (!open) return null;

  const styles = {
    backdrop: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
    },
    panel: {
      width: 'min(94vw, 560px)', maxHeight: '92vh', overflowY: 'auto',
      borderRadius: 12, border: `1px solid ${theme.border}`, backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`, color: theme.textPrimary, padding: 16,
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    title: { margin: 0, fontSize: '1.05rem', fontWeight: 900, letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 },
    kicker: { fontSize: 11, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 800 },
    goal: {
      maxWidth: 500, textAlign: 'center', fontSize: 13.5, lineHeight: 1.5, fontWeight: 600,
      color: theme.textPrimary,
    },
    banner: (kind) => ({
      maxWidth: 500, textAlign: 'center', fontSize: 13, lineHeight: 1.45, fontWeight: 700,
      whiteSpace: 'pre-wrap',
      color: kind === 'good' ? '#7ee787' : kind === 'bad' ? '#ffcf6e' : theme.primary,
    }),
    attemptsRow: { display: 'flex', gap: 6, alignItems: 'center' },
    attemptDot: (state) => ({
      width: 10, height: 10, borderRadius: 999,
      background: state === 'burned' ? '#ff6b6b' : state === 'won' ? '#7ee787' : 'rgba(255,255,255,0.15)',
      border: `1px solid ${theme.border}`,
    }),
    stepRow: { display: 'flex', gap: 5, alignItems: 'center' },
    stepPip: (state) => ({
      width: 22, height: 6, borderRadius: 999,
      background: state === 'done' ? '#7ee787' : state === 'active' ? theme.primary : 'rgba(255,255,255,0.12)',
    }),
    doneCard: {
      width: '100%', boxSizing: 'border-box', borderRadius: 10, padding: '12px 14px',
      border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.04)',
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', textAlign: 'center',
    },
    shareBtn: {
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8,
      border: 'none', backgroundColor: theme.primary, color: theme.secondary, fontWeight: 800,
      fontSize: 13, cursor: 'pointer',
    },
    sub: { fontSize: 12, color: theme.textSecondary },
  };

  const streak = getStreak();

  return (
    <div className="qc-puzzle-backdrop" style={styles.backdrop} onClick={onClose}>
      <div
        className="qc-puzzle-panel" style={styles.panel} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="qc-puzzle-title"
      >
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.kicker}>
              {previewDate ? `Preview · ${previewDate}` : `Daily Puzzle ${puzzle ? `#${puzzle.number}` : ''}`} · {puzzle ? `${puzzle.recipe.moves} move${puzzle.recipe.moves > 1 ? 's' : ''}` : ''}
            </div>
            <h2 id="qc-puzzle-title" style={styles.title}>
              <PuzzleIcon size={17} color={theme.primary} />
              {puzzle ? `${puzzle.recipe.title} ${puzzle.recipe.emoji}` : 'Preparing…'}
            </h2>
          </div>
          <IconButton
            icon={XIcon} size={20} title="Close" ariaLabel="Close daily puzzle"
            className="qc-puzzle-close" onClick={onClose} width={36} height={36} radius={8}
            bg={theme.secondary} color={theme.error} hoverInvert={true} shadow="transparent"
          />
        </div>

        {phase === 'loading' ? (
          <div style={{ padding: '60px 0', color: theme.textSecondary, fontWeight: 700 }}>
            Collapsing today's wavefunction…
          </div>
        ) : null}

        {puzzle && phase !== 'loading' ? (
          <>
            {puzzle.plies.length > 1 ? (
              <div style={styles.stepRow} aria-label="Puzzle steps">
                {puzzle.plies.map((_, i) => (
                  <span key={`step-${i}`} style={styles.stepPip(
                    phase === 'done' && result && result.solved ? 'done' : i < plyIdx ? 'done' : i === plyIdx ? 'active' : 'todo'
                  )} />
                ))}
              </div>
            ) : null}

            <MiniBoard
              files={8}
              ranks={8}
              cell={Math.max(30, Math.min(52, Math.floor((Math.min(window.innerWidth * 0.94, 560) - 66) / 8)))}
              pieces={live.map((p) => ({
                sq: p.square,
                side: p.side,
                types: p.possibleTypes.join(''),
                pips: p.coherence,
                regain: Math.max(0, p.recohere || 0),
                chain: Boolean(p.entangledWith),
                chevrons: Boolean(p.wasPromoted),
                sealed: p.possibleTypes.length <= 2 && !p.entangledWith && !canPieceRecohere(display, p.id),
                mark: marks.includes(p.square),
                ring: threats.some((t) => t.to === p.square),
              }))}
              arrows={[
                ...threats.map((t) => ({ from: t.from, to: t.to, side: t.side })),
                ...(revealArrow ? [{ from: revealArrow.from, to: revealArrow.to, side: 'white' }] : []),
              ]}
              highlights={[
                ...(selected ? [selected.square] : []),
                ...(ply && ply.ctx && ply.ctx.targetSquare && phase === 'playing' ? [ply.ctx.targetSquare] : []),
              ]}
              targets={targets}
              onSquareClick={phase === 'playing' ? handleSquareClick : null}
              svgStyleBySide={svgStyleBySide}
            />

            {phase === 'playing' ? (
              <>
                <div style={styles.attemptsRow} aria-label="Attempts">
                  {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
                    <span key={`att-${i}`} style={styles.attemptDot(i < attempts ? 'burned' : 'left')} />
                  ))}
                  <span style={{ ...styles.sub, marginLeft: 6 }}>White to move</span>
                </div>
                <div style={styles.goal}>{ply ? ply.goalText : ''}</div>
              </>
            ) : null}

            {banner ? <div style={styles.banner(banner.kind)}>{banner.text}</div> : null}

            {phase === 'done' && result ? (
              <div style={styles.doneCard}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>
                  {result.solved
                    ? `Solved on try ${result.tries} ${result.tries === 1 ? '— first collapse!' : ''}`
                    : 'It collapsed on you today.'}
                </div>
                <div style={styles.sub}>
                  {streak > 0 ? `🔥 ${streak} day streak · ` : ''}Next puzzle in {countdown}
                </div>
                <button type="button" className="qc-puzzle-share" style={styles.shareBtn} onClick={handleShare}>
                  <ShareIcon size={15} /> {copied ? 'Copied!' : 'Share result'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function successLine(puzzle) {
  switch (puzzle.recipe.key) {
    case 'instrument': return 'Three secrets, one landing. The pulse touched them all.';
    case 'census': return 'The census closed — and a piece you never touched confessed.';
    case 'seal': return 'Sealed. Its clock is a solid line now; nothing is coming back.';
    case 'snap': return 'The chain snapped — both partners resolved at once.';
    case 'phantom': return 'The phantom capture, with a discovered check. Beautiful.';
    case 'mate': return '⟨King survives|ψ⟩ = 0. Checkmate across every world.';
    case 'snaptrap': return 'Unmasked and erased. The trap closed in two.';
    case 'ledger': return 'Census, then seal. The ledger is closed.';
    case 'hunt3': case 'hunt4': return 'The ladder closed at the wall. No world survives.';
    case 'investigation': return 'Probe. Expose. Punish. Case closed.';
    default: return 'Solved.';
  }
}
