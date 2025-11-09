// frontend/src/ai/aiWorker.js
// Purpose: Web Worker that performs AI computations off the main thread. Adds a pre-capture trade scan that forces any materially winning capture, then runs alpha-beta restricted to up to 5 random movers.
// Imports From: ./alphaBetaEngine.js, ../chessboard/quantumEngine.js
// Exported To: ./useLocalAi.js

import pickBestMove, { seeNetForLandingSquare } from './alphaBetaEngine.js';
import { clonePieces, generateLegalReplies } from '../chessboard/quantumEngine.js';

const DEBUG_WORKER = true;

function minifyMove(mv) {
  if (!mv || typeof mv !== 'object') return null;
  if (mv.type === 'move') return { type: 'move', from: mv.from, to: mv.to };
  if (mv.type === 'castle') return { type: 'castle', plan: mv.plan };
  return null;
}

function countCaptured(pieces) {
  let c = 0;
  for (const p of pieces) if (p.captured) c += 1;
  return c;
}

function isCapture(rootPieces, reply) {
  if (!reply || !reply.resultPieces) return false;
  return countCaptured(reply.resultPieces) > countCaptured(rootPieces);
}

function randomChoice(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function isSeeSafeCapture(rootPieces, sideToMove, mv) {
  if (!mv || mv.type !== 'move') return false;
  const net = seeNetForLandingSquare(mv.resultPieces, sideToMove, mv.to);
  return net >= 0; // safe if SEE net is non-negative
}

function approximateGamePly(pieces) {
  let total = 0;
  for (const p of pieces) total += (p.moveCount || 0);
  return Math.floor(total / 2);
}

function countFriendlyCaptured(pieces, side) {
  let c = 0;
  for (const p of pieces) if (p.side === side && p.captured) c += 1;
  return c;
}

function getPieceAtSquare(pieces, sq) {
  for (const p of pieces) {
    if (!p.captured && p.square === sq) return p;
  }
  return null;
}

function pickUpToFiveMoverIds(rootPieces, legal, side) {
  const ids = new Set();
  for (const mv of legal) {
    if (mv.type === 'move' && mv.from) {
      const mover = getPieceAtSquare(rootPieces, mv.from);
      if (mover && mover.side === side) ids.add(mover.id);
    } else if (mv.type === 'castle' && mv.plan) {
      // Allow either castle piece to count as a mover
      const p1 = rootPieces.find((p) => p.id === mv.plan.piece1_id);
      const p2 = rootPieces.find((p) => p.id === mv.plan.piece2_id);
      if (p1 && p1.side === side) ids.add(p1.id);
      if (p2 && p2.side === side) ids.add(p2.id);
    }
  }
  const list = Array.from(ids);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 5);
}

self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type !== 'think') return;

  const { id, payload } = data;
  if (!payload) {
    self.postMessage({ type: 'error', id, message: 'Missing payload' });
    return;
  }

  const { pieces, sideToMove, difficulty } = payload;

  try {
    const root = clonePieces(pieces || []);

    // Generate legal replies once for this think cycle
    const legal = generateLegalReplies(root, sideToMove, 0);

    // 1) Forced favorable capture based on SEE-style capture trade (continuous back-and-forth captures)
    try {
      if (Array.isArray(legal) && legal.length > 0) {
        let bestCap = null;
        let bestNet = -Infinity;
        for (const mv of legal) {
          if (!isCapture(root, mv)) continue;
          if (mv.type !== 'move') continue; // castling never captures
          const net = seeNetForLandingSquare(mv.resultPieces, sideToMove, mv.to);
          if (net > 0 && net > bestNet) {
            bestNet = net;
            bestCap = mv;
          }
        }
        if (bestCap) {
          const mini = minifyMove(bestCap);
          if (DEBUG_WORKER) {
            try {
              // eslint-disable-next-line no-console
              console.debug('[AI-Worker][forced-favorable-capture]', { id, side: sideToMove, bestNet, chosen: mini });
            } catch (_) {}
          }
          self.postMessage({ type: 'baseline', id, move: mini });
          self.postMessage({ type: 'best', id, move: mini });
          return; // commit immediately to the materially winning capture
        }
      }
    } catch (forcedErr) {
      if (DEBUG_WORKER) {
        try { console.error('[AI-Worker][forced-capture-error]', forcedErr); } catch (_) {}
      }
      // continue to normal flow
    }

    // Early-opening randomization: first 3 full moves (6 plies), unless AI has already lost a piece
    const earlyPly = approximateGamePly(root);
    const aiLosses = countFriendlyCaptured(root, sideToMove);
    const inEarlyRandom = earlyPly < 6 && aiLosses === 0;

    if (Array.isArray(legal) && legal.length > 0 && inEarlyRandom) {
      const randomMove = randomChoice(legal);
      const mini = minifyMove(randomMove);
      if (DEBUG_WORKER) {
        try {
          // eslint-disable-next-line no-console
          console.debug('[AI-Worker][early-random]', { id, side: sideToMove, ply: earlyPly, losses: aiLosses, chosen: mini });
        } catch (_) {}
      }
      self.postMessage({ type: 'baseline', id, move: mini });
      self.postMessage({ type: 'best', id, move: mini });
      return; // skip deeper computation in early random phase
    }

    // Emit a safer baseline move quickly. Prefer SEE-safe captures; else prefer non-captures; else fallback.
    try {
      if (Array.isArray(legal) && legal.length > 0) {
        const capturing = legal.filter((mv) => isCapture(root, mv));
        const nonCaptures = legal.filter((mv) => !isCapture(root, mv));

        const safeCaptures = capturing.filter((mv) => isSeeSafeCapture(root, sideToMove, mv));

        let baselineMove = null;
        if (safeCaptures.length > 0) {
          baselineMove = randomChoice(safeCaptures);
        } else if (nonCaptures.length > 0) {
          baselineMove = randomChoice(nonCaptures);
        } else {
          baselineMove = randomChoice(capturing);
        }

        const baseline = minifyMove(baselineMove);
        if (DEBUG_WORKER) {
          try {
            // eslint-disable-next-line no-console
            console.debug('[AI-Worker][baseline]', {
              id,
              side: sideToMove,
              legalCount: legal.length,
              captures: capturing.length,
              safeCaptures: safeCaptures.length,
              nonCaptures: nonCaptures.length,
              chosen: baseline,
            });
          } catch (_) {}
        }
        self.postMessage({ type: 'baseline', id, move: baseline });
      } else {
        self.postMessage({ type: 'baseline', id, move: null });
      }
    } catch (baselineErr) {
      if (DEBUG_WORKER) {
        try { console.error('[AI-Worker][baseline-error]', baselineErr); } catch (_) {}
      }
      self.postMessage({ type: 'baseline', id, move: null });
    }

    // 2) Restrict the alpha-beta root to up to 5 random movers
    let allowedRootPieceIds = [];
    try {
      if (Array.isArray(legal) && legal.length > 0) {
        allowedRootPieceIds = pickUpToFiveMoverIds(root, legal, sideToMove);
        if (DEBUG_WORKER) {
          try {
            // eslint-disable-next-line no-console
            console.debug('[AI-Worker][root-mover-sample]', { id, side: sideToMove, count: allowedRootPieceIds.length, ids: allowedRootPieceIds });
          } catch (_) {}
        }
      }
    } catch (sampleErr) {
      if (DEBUG_WORKER) {
        try { console.error('[AI-Worker][root-mover-sample-error]', sampleErr); } catch (_) {}
      }
      allowedRootPieceIds = [];
    }

    // Compute the alpha-beta best move with root restriction.
    const best = pickBestMove({ pieces: root, sideToMove, difficulty, allowedRootPieceIds });
    const bestMin = minifyMove(best);
    if (DEBUG_WORKER) {
      try {
        // eslint-disable-next-line no-console
        console.debug('[AI-Worker][best]', { id, side: sideToMove, best: bestMin });
      } catch (_) {}
    }
    self.postMessage({ type: 'best', id, move: bestMin });
  } catch (err) {
    if (DEBUG_WORKER) {
      try { console.error('[AI-Worker][error]', err); } catch (_) {}
    }
    self.postMessage({ type: 'error', id, message: (err && err.message) || 'Worker error' });
  }
});
