// frontend/src/puzzle/minedPreview.js
// Purpose: DEV-ONLY preview of mined puzzles (tools/puzzle-miner.mjs output,
// swing/par format). ?mined=N converts chain N of ./minedPreviewData.json
// into the shape MinedPuzzleModal plays in PAR MODE: the player sees Black's
// mistake, plays parPlies free moves against live engine replies, and is
// scored by fidelity vs the certified par evals. This is also the future
// adapter shape for mined dailies.
// Imports From: ./puzzleGenerator.js, ../chessboard/quantumEngine.js
// Exported To: ../App.jsx (dynamic import, dev builds only)

import { enumerateWhiteMoves } from './whiteMoves.js';
import { simulateStandardMove } from '../chessboard/quantumEngine.js';

const THEME_TITLES = {
  measure3: 'The Instrument',
  censusCollapse: 'The Census',
  seal: 'The Seal',
  unmask: 'The Unmasking',
  epCheck: 'The Phantom',
  mate: 'Collapse Mate',
  recohere: 'The Regrowth',
};

function minedTitle(chain) {
  const named = chain.themes.map((t) => THEME_TITLES[t]).filter(Boolean);
  return named.length ? `Mined: ${named.join(' + ')}` : 'Mined: The Slip';
}

// The client's eval ruler caps mates at 30 (see replyAwareEval); the miner's
// ply-adjusted mate scores run 900+. Clamp par onto the client ruler so
// fidelity math compares like with like.
const clampPar = (v) => Math.min(v, 30);

const keyOf = (m) => `${m.from}>${m.to}${m.enPassant ? 'ep' : ''}`;

// Par on the GAUGE'S ruler. The modal grades the player's landing (a
// depth-3 gauge score) against par — so par must be the certified move's
// score in the SAME depth-3 eval tables the gauge reads, not the miner's
// depth-4 certification number. Mixing rulers produced 150-200% "fidelity"
// on ordinary good runs. Falls back to the miner's parEvals when a table
// is missing (old fixtures).
function gaugeParEvals(chain) {
  return chain.steps.map((step, k) => {
    const table = (chain.evalTables || [])[k];
    const v = table && table.evals ? table.evals[keyOf(step.bestMove)] : undefined;
    return v === undefined ? chain.parEvals[k] : v;
  });
}

// Convert one mined chain into the modal's par-mode puzzle. The par line is
// re-checked ply by ply on the real engine (legality only — the player is
// free to diverge, so we never pin positions beyond the start): if the
// fixture and engine have drifted enough that the certified line is not
// even legal, refuse rather than lie.
export function buildMinedPuzzle(chain, idx) {
  let pieces = chain.start.pieces;
  let lastMove = chain.start.lastMove || null;

  for (let k = 0; k < chain.steps.length; k++) {
    const step = chain.steps[k];
    const moves = enumerateWhiteMoves(pieces, lastMove);
    const hit = moves.find((m) =>
      m.from === step.bestMove.from && m.to === step.bestMove.to &&
      Boolean(m.enPassant) === Boolean(step.bestMove.enPassant));
    if (!hit) return null; // fixture/engine drifted — refuse rather than lie

    if (k < chain.steps.length - 1) {
      const reply = chain.blackReplies[k];
      const mover = reply && hit.after.find((p) => !p.captured && p.side === 'black' && p.square === reply.from);
      if (!mover) return null;
      const sim = simulateStandardMove(hit.after, mover.id, reply.to, 0);
      if (!sim.ok) return null;
      pieces = sim.pieces;
      lastMove = {
        side: 'black', pieceId: mover.id, from: reply.from, to: reply.to,
        isDoubleStep: false, crossedSquare: null,
        measuredSquares: sim.measuredSquares || [],
      };
    }
  }

  return {
    date: `#${idx}`,
    recipe: {
      key: 'mined-par',
      title: minedTitle(chain),
      emoji: '⛏️',
      moves: chain.parPlies,
    },
    start: {
      pieces: chain.start.pieces,
      lastMove: chain.start.lastMove || null,
      captureCounter: chain.start.captureCounter || 0,
    },
    mistake: chain.mistake, // { from, to, evalBefore, evalAfter, swing }
    // Instant-gauge tables mined alongside the chain (may be absent on old
    // fixtures): [{ sig, evals }] keyed by position signature.
    evalTables: chain.evalTables || [],
    parEvals: gaugeParEvals(chain).map(clampPar),
    parMoves: chain.steps.map((step) => ({ ...step.bestMove })),
    parFirstMove: { ...chain.steps[0].bestMove }, // revealed after a rough run
    themes: chain.themes,
    trickiness: chain.trickiness,
  };
}

// ?mined=N entry point: N indexes the fixture's chains (0-based).
export async function loadMinedPreview(idx) {
  const data = (await import('./minedPreviewData.json')).default;
  const chain = data.chains[idx];
  if (!chain) {
    console.warn(`[minedPreview] no chain ${idx}; fixture has 0..${data.chains.length - 1}`);
    return null;
  }
  const puzzle = buildMinedPuzzle(chain, idx);
  if (puzzle) {
    console.info(`[minedPreview] chain ${idx}: game ${chain.game} ply ${chain.startPly}, mistake ${chain.mistake.from}->${chain.mistake.to} (${chain.mistake.evalBefore} -> ${chain.mistake.evalAfter}), par [${chain.parEvals.join(', ')}], trickiness ${chain.trickiness}, themes [${chain.themes.join(', ')}]`);
  }
  return puzzle;
}
