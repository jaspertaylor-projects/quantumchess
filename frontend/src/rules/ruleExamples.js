// Small, census-complete study positions. Every move uses the live rules engine.
import {
  applyQuantumConstraints, computeCastlePlanInPosition, simulateCastle,
  simulateEnPassant, simulateStandardMove, listEnPassantCaptures,
} from '../chessboard/quantumEngine.js';
import { buildLastMoveRecord } from '../chessboard/advanceCore.js';

export const TYPE_NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
const SET = 'ppppppppnnbbrrqk';
const piece = (id, side, square, types, captured = false) => ({
  id, side, square, possibleTypes: [...types], baseTypes: [...types], promoTypes: [],
  captured, moveCount: 1, wasPromoted: false, castled: false,
});

function position(white, black, whiteSlots, blackSlots) {
  return ['white', 'black'].flatMap((side) => {
    const rows = side === 'white' ? white : black;
    const reserved = [...(side === 'white' ? whiteSlots : blackSlots)];
    const remaining = [...SET];
    for (const type of reserved) {
      const index = remaining.indexOf(type);
      if (index < 0) throw new Error(`Invalid ${side} study inventory`);
      remaining.splice(index, 1);
    }
    if (rows.length !== reserved.length) throw new Error('Study inventory must seat every living piece');
    return [
      ...rows.map(([id, square, types]) => piece(id, side, square, types)),
      ...remaining.map((type, index) => piece(`${side}-captured-${index}`, side, null, type, true)),
    ];
  });
}

const whiteKing = ['wk', 'a1', 'k'];
const blackKing = ['bk', 'h8', 'k'];
export const RULE_EXAMPLES = {
  measurement: {
    title: 'Measure a diagonal move',
    setup: () => position(
      [['mover', 'd2', 'pnbrqk'], ...['a1', 'b1', 'g1', 'h1', 'a2'].map((sq, i) => [`support-${i}`, sq, 'pnbrqk'])],
      [blackKing], 'pnbrqk', 'k'),
    context: 'The six White pieces share one remaining slot of each identity. Each can still be any of the six types.',
    watch: ['mover'],
    start: 'Notice the six identities at d2. The highlighted diagonal is two squares long: only Bishop and Queen can make it.',
    steps: [{ from: 'd2', to: 'f4', notice: 'At f4, only Bishop and Queen remain. The piece moved without choosing between those two identities.' }],
  },
  capture: {
    title: 'Capture a superposition',
    setup: () => position([whiteKing, ['mover', 'd1', 'r']], [['victim', 'd5', 'nq'], ['partner', 'h7', 'nq'], blackKing], 'kr', 'nqk'),
    context: 'Black’s d5 and h7 pieces share the last Knight and Queen slots.',
    watch: ['mover', 'victim', 'partner'],
    start: 'Watch d5: it is Knight–Queen. Move the Rook onto it to capture; compare this with a Zap, which leaves its target on the board.',
    steps: [{ from: 'd1', to: 'd5', notice: 'The victim leaves d5 as a captured Knight, its cheaper identity. It still fills the Knight slot, so h7 becomes Queen.' }],
  },
  census: {
    title: 'One move resolves a distant piece',
    setup: () => position([whiteKing, ['mover', 'c1', 'pn'], ['distant', 'h2', 'pn']], [blackKing], 'kpn', 'k'),
    context: 'One White Knight is already captured. The pieces at c1 and h2 share the remaining Knight slot and one Pawn slot.',
    watch: ['mover', 'distant'],
    start: 'Both c1 and h2 are Pawn–Knight. Watch h2 while the other piece makes a knight leap.',
    steps: [{ from: 'c1', to: 'd3', notice: 'The leap fixes d3 as Knight. That fills the last Knight slot, so distant h2 becomes Pawn without being attacked or protected by the mover.' }],
  },
  zap: {
    title: 'Attack a piece without capturing it',
    setup: () => position([whiteKing, ['mover', 'c3', 'n']], [['target', 'f6', 'rq'], ['partner', 'h8', 'rq'], ['bk', 'a8', 'k']], 'kn', 'rqk'),
    context: 'Black’s f6 and h8 pieces share one Rook and one Queen slot. The Black King is already definite at a8.',
    watch: ['mover', 'target', 'partner'],
    start: 'Move the Knight to e4. From there it attacks f6, so f6 is zapped even though the Knight never lands on it.',
    steps: [{ from: 'c3', to: 'e4', notice: 'The red target at f6 loses Queen and remains on the board as Rook. The census then fixes distant h8 as Queen.' }],
  },
  heal: {
    title: 'Protect allies to restore possibilities',
    setup: () => position([whiteKing, ['mover', 'e2', 'n'], ['bishop', 'h5', 'b'], ['pawn', 'd5', 'p']], [['bk', 'a8', 'k']], 'knbp', 'k'),
    context: 'The h5 and d5 allies occupy one Bishop and one Pawn slot. Their heals must work together to keep both assignments possible.',
    watch: ['mover', 'bishop', 'pawn'],
    start: 'The Knight on f4 will protect both h5 and d5. Watch their identities; neither ally needs to move.',
    steps: [{ from: 'e2', to: 'f4', notice: 'Both allies become Pawn–Bishop: h5 regains Pawn, and d5 regains Bishop. Joint healing allows them to exchange census assignments.' }],
  },
  castle: {
    title: 'Bring a Rook–King pair together',
    setup: () => position([['left', 'a1', 'rk'], ['right', 'e1', 'rk']], [blackKing], 'rk', 'k'),
    context: 'White’s two living pieces share a Rook slot and the King slot. The other Rook has been captured.',
    watch: ['left', 'right'],
    start: 'Both a1 and e1 include Rook and King, and their back-rank interval is empty. Select the pair to castle.',
    steps: [{ kind: 'castle', from: 'a1', to: 'e1', notice: 'The pair moves to c1 and d1. Both remain Rook–King; the census allows exactly one to be King. This uses White’s one castle.' }],
  },
  enpassant: {
    title: 'Capture through the crossed square',
    setup: () => position([whiteKing, ['mover', 'e5', 'p']], [blackKing, ['victim', 'd7', 'p']], 'kp', 'kp'),
    context: 'Black moves first in this study. White can answer the double-step with en passant only on the immediately following turn.',
    watch: ['victim', 'mover'],
    start: 'First play Black’s d7 → d5. Watch the empty square d6 that the Pawn crosses.',
    steps: [
      { from: 'd7', to: 'd5', notice: 'Black crossed d6. Now move White’s e5 Pawn to that empty square; the victim is beside it on d5.' },
      { kind: 'enpassant', from: 'e5', to: 'd6', notice: 'White lands on d6, while the Black Pawn disappears from d5. Both pieces are resolved as Pawn, including the captured victim.' },
    ],
  },
  promotion: {
    title: 'Transform the Pawn branch',
    setup: () => position([whiteKing, ['mover', 'c7', 'p']], [['bk', 'h6', 'k']], 'kp', 'k'),
    context: 'The seven other White Pawns have been captured. This piece still owns the eighth Pawn census slot after promotion.',
    watch: ['mover'],
    start: 'Move the Pawn from c7 onto White’s farthest rank. Watch both the identities and the promotion marker.',
    steps: [{ from: 'c7', to: 'c8', notice: 'At c8 the Pawn becomes Knight–Bishop–Rook–Queen. The bar under the piece marks its Pawn origin: four movement possibilities, still one Pawn census slot.' }],
  },
  shield: {
    title: 'Attack two superpositions and see a shield',
    setup: () => position([whiteKing, ['mover', 'c2', 'n']], [['left', 'b3', 'qk'], ['right', 'f3', 'qk']], 'kn', 'qk'),
    context: 'Black’s b3 and f3 pieces share exactly one Queen slot and one King slot. Both begin as Queen–King.',
    watch: ['mover', 'left', 'right'],
    start: 'Move the Knight to d4, where it attacks both Queen–King pieces. Watch f3 for a gold shield.',
    steps: [
      { from: 'c2', to: 'd4', notice: 'Both Zaps try Queen instead of removing every King possibility. Only one Queen removal fits: b3 becomes King; f3 shields against its direct Zap but becomes Queen through the census. The Knight checks the revealed King at b3. This is not checkmate: Black can escape to a3.' },
      { from: 'b3', to: 'a3', notice: 'Black moves its King to a3, out of the Knight’s attack. Play continues. The shield at f3 stopped its direct Zap, but the census still resolved it as Queen. Check only becomes checkmate when there is no legal reply.' },
    ],
  },
  'definite-shield': {
    title: 'One identity left: nothing to Zap away',
    setup: () => position([whiteKing, ['mover', 'c3', 'n']], [['target', 'f6', 'r'], blackKing], 'kn', 'rk'),
    context: 'The Black piece at f6 is already a definite Rook. Shields apply to every piece type, not just Kings.',
    watch: ['mover', 'target'],
    start: 'Move the Knight to e4. It attacks the Rook at f6 without landing on it.',
    steps: [{ from: 'c3', to: 'e4', notice: 'The Rook at f6 shows a gold shield and stays a Rook. Removing its last identity would erase the piece, which Zap cannot do. The Knight still attacks f6: the shield does not prevent a later capture.' }],
  },
  king: {
    title: 'A shield does not stop checkmate',
    setup: () => position([['wk', 'c7', 'k'], ['mover', 'b6', 'r']], [['bk', 'a8', 'k']], 'kr', 'k'),
    context: 'Both Kings are definite. White’s King on c7 controls b7 and b8.',
    watch: ['mover', 'bk'],
    start: 'Move the Rook to a6. Notice the Black King at a8 and its three possible escape squares: a7, b7 and b8.',
    steps: [{ from: 'b6', to: 'a6', notice: 'The King has only one identity left, so it shields against Zap. The Rook still checks it along the a-file and covers a7. White’s King covers b7 and b8. Black has no legal escape: checkmate, despite the shield.' }],
  },
  draw: {
    title: 'No move, but no check',
    setup: () => position([['wk', 'c6', 'k'], ['mover', 'c5', 'q']], [['bk', 'a8', 'k']], 'kq', 'k'),
    context: 'Black has only its King. Compare this position with the checkmate example above.',
    watch: ['mover', 'bk'],
    start: 'Move the Queen to b6. Watch a8 and the escape squares a7, b7 and b8.',
    steps: [{ from: 'c5', to: 'b6', notice: 'The Queen controls a7, b7 and b8, but does not attack a8, so the King receives no Zap or shield. Black has no legal move and is not in check: stalemate, a draw, not checkmate.' }],
  },
};

export function advanceRuleExample(pieces, step, lastMove = null) {
  const mover = pieces.find((p) => !p.captured && p.square === step.from);
  if (!mover) throw new Error(`Study mover missing at ${step.from}`);
  let result;
  if (step.kind === 'castle') {
    const partner = pieces.find((p) => !p.captured && p.square === step.to);
    const choice = computeCastlePlanInPosition(pieces, mover.side, mover.id, partner?.id);
    if (!choice.canCastle) throw new Error(choice.reason);
    result = simulateCastle(pieces, choice.plan);
  } else if (step.kind === 'enpassant') {
    const choice = listEnPassantCaptures(pieces, mover.side, lastMove).find((m) => m.pieceId === mover.id && m.to === step.to);
    if (!choice) throw new Error('Study en passant window is closed');
    result = simulateEnPassant(pieces, mover.id, step.to, choice.victimId, 32);
  } else {
    result = simulateStandardMove(pieces, mover.id, step.to, 32);
  }
  if (!result.ok) throw new Error(result.reason);
  return { ...result, lastMove: step.kind === 'castle' ? null : buildLastMoveRecord({
    finalPieces: result.pieces, moverId: mover.id, from: step.from, to: step.to,
    side: mover.side, didCapture: result.didCapture, usedEnPassant: step.kind === 'enpassant',
  }) };
}

export function createRuleExample(id) {
  const example = RULE_EXAMPLES[id];
  if (!example) return null;
  const initial = applyQuantumConstraints(example.setup());
  const frames = [{ pieces: initial, notice: example.start }];
  for (const step of example.steps) {
    const prior = frames[frames.length - 1];
    frames.push({ ...advanceRuleExample(prior.pieces, step, prior.lastMove), notice: step.notice });
  }
  return { ...example, frames };
}
