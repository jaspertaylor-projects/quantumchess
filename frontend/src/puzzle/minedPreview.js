// frontend/src/puzzle/minedPreview.js
// Purpose: DEV-ONLY preview of mined puzzles (tools/puzzle-miner.mjs output).
// ?mined=N converts chain N of ./minedPreviewData.json into the exact puzzle
// shape DailyPuzzleModal plays (subgoal 'exactMove'), in practice mode —
// nothing recorded, streak untouched. This is also the future adapter shape
// for mined dailies: a mined chain replays through the same modal machinery.
// Imports From: ./puzzleGenerator.js, ../chessboard/quantumEngine.js
// Exported To: ../App.jsx (dynamic import, dev builds only)

import { enumerateWhiteMoves } from './puzzleGenerator.js';
import { simulateStandardMove } from '../chessboard/quantumEngine.js';
import { fromAlgebraic, toAlgebraic } from '../chessboard/boardUtils.js';

const THEME_TITLES = {
  measure3: 'The Instrument',
  censusCollapse: 'The Census',
  seal: 'The Seal',
  snap: 'The Snap',
  unmask: 'The Unmasking',
  epCheck: 'The Phantom',
  mate: 'Collapse Mate',
};

function minedTitle(chain) {
  const named = chain.themes.map((t) => THEME_TITLES[t]).filter(Boolean);
  return named.length ? `Mined: ${named.join(' + ')}` : 'Mined: The Only Move';
}

function blackLastMove(afterPieces, mover, from, to, measuredSquares) {
  const lastMove = {
    side: 'black', pieceId: mover.id, from, to,
    isDoubleStep: false, crossedSquare: null,
    measuredSquares: measuredSquares || [],
  };
  if ((mover.moveCount || 0) === 0) {
    const fp = fromAlgebraic(from);
    const tp = fromAlgebraic(to);
    const moved = afterPieces.find((p) => p.id === mover.id && !p.captured);
    if (fp && tp && moved && fp.fileIndex === tp.fileIndex && fp.rankIndex - tp.rankIndex === 2 && moved.possibleTypes.includes('p')) {
      lastMove.isDoubleStep = true;
      lastMove.crossedSquare = toAlgebraic(fp.fileIndex, fp.rankIndex - 1);
    }
  }
  return lastMove;
}

// Convert one mined chain into the modal's puzzle shape, re-simulating every
// ply on the real engine (so solutionAfter/measured marks are authentic).
export function buildMinedPuzzle(chain, idx) {
  let pieces = chain.start.pieces;
  let lastMove = chain.start.lastMove || null;
  const plies = [];

  for (let k = 0; k < chain.steps.length; k++) {
    const step = chain.steps[k];
    const moves = enumerateWhiteMoves(pieces, lastMove);
    const hit = moves.find((m) =>
      m.from === step.bestMove.from && m.to === step.bestMove.to &&
      Boolean(m.enPassant) === Boolean(step.bestMove.enPassant));
    if (!hit) return null; // fixture/engine drifted — refuse rather than lie

    const record = {
      pieces,
      lastMove,
      subgoal: 'exactMove',
      ctx: { ...step.bestMove },
      goalText: `Mined from a real game: of ${step.numChoices} legal moves, exactly ONE holds the position — every alternative loses by ${step.gap}+ pawns (engine-certified at three depths). Find it.`,
      solution: { from: hit.from, to: hit.to, enPassant: hit.enPassant },
      solutionAfter: hit.after,
      solutionMeasured: hit.measuredSquares,
      legalMoveCount: moves.length,
      reply: null,
    };

    if (k < chain.steps.length - 1) {
      const reply = chain.blackReplies[k];
      const mover = reply && hit.after.find((p) => !p.captured && p.side === 'black' && p.square === reply.from);
      if (!mover) return null;
      const sim = simulateStandardMove(hit.after, mover.id, reply.to, 0);
      if (!sim.ok) return null;
      record.reply = { from: reply.from, to: reply.to };
      pieces = sim.pieces;
      lastMove = blackLastMove(sim.pieces, mover, reply.from, reply.to, sim.measuredSquares);
    }

    plies.push(record);
  }

  return {
    date: `mined-${idx}`,
    number: 0,
    version: 0,
    recipe: {
      key: 'mined',
      title: minedTitle(chain),
      emoji: '⛏️',
      moves: chain.steps.length,
    },
    pieces: chain.start.pieces,
    lastMove: chain.start.lastMove || null,
    plies,
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
    console.info(`[minedPreview] chain ${idx}: game ${chain.game} ply ${chain.startPly}, trickiness ${chain.trickiness}, themes [${chain.themes.join(', ')}]`);
  }
  return puzzle;
}
