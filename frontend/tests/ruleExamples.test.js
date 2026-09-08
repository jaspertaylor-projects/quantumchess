import { describe, expect, it } from 'vitest';
import { RULE_EXAMPLES, createRuleExample, advanceRuleExample } from '../src/rules/ruleExamples.js';
import { RULES } from '../src/rules/rulebook.js';
import { RULE_GROUPS } from '../src/rules/rulebookPresentation.js';
import { applyQuantumConstraints, isCensusConsistent, hasCollapsedKingCapturable, evaluateTerminalAfterMove, generateLegalReplies } from '../src/chessboard/quantumEngine.js';

const at = (frame, id) => frame.pieces.find((p) => p.id === id);
const final = (id) => createRuleExample(id).frames.at(-1);

describe('rulebook board studies', () => {
  it('covers each rule exactly once in the reading order', () => {
    const ids = RULE_GROUPS.flatMap((group) => group.rules);
    expect([...ids].sort()).toEqual(RULES.map((rule) => rule.id).sort());
    expect(Object.keys(RULE_EXAMPLES).sort()).toEqual([...ids].sort());
    expect(ids.indexOf('census')).toBeLessThan(ids.indexOf('zap'));
    expect(ids.indexOf('promotion')).toBeLessThan(ids.indexOf('shield'));
    expect(ids.indexOf('definite-shield')).toBeLessThan(ids.indexOf('king'));
  });
  for (const id of Object.keys(RULE_EXAMPLES)) {
    it(`${id}: every displayed position is census-complete and every move preserves the mover's King`, () => {
      const example = createRuleExample(id);
      expect(example.frames[0].pieces).toEqual(applyQuantumConstraints(example.frames[0].pieces));
      for (const frame of example.frames) {
        const live = frame.pieces.filter((p) => !p.captured);
        expect(new Set(live.map((p) => p.square)).size).toBe(live.length);
        for (const side of ['white', 'black']) {
          expect(frame.pieces.filter((p) => p.side === side)).toHaveLength(16);
          expect(isCensusConsistent(frame.pieces, side)).toBe(true);
        }
      }
      example.steps.forEach((step, index) => {
        const before = example.frames[index];
        const mover = before.pieces.find((p) => !p.captured && p.square === step.from);
        const snapshot = JSON.stringify(before.pieces);
        const result = advanceRuleExample(before.pieces, step, before.lastMove);
        expect(JSON.stringify(before.pieces)).toBe(snapshot);
        expect(result.pieces).toEqual(example.frames[index + 1].pieces);
        expect(hasCollapsedKingCapturable(result.pieces, mover.side)).toBe(false);
      });
    });
  }
  it('shows the advertised movement, capture and distant census changes', () => {
    expect(at(final('measurement'), 'mover').possibleTypes).toEqual(['b', 'q']);
    expect(at(final('capture'), 'victim')).toMatchObject({ captured: true, square: null, possibleTypes: ['n'] });
    expect(at(final('capture'), 'partner').possibleTypes).toEqual(['q']);
    expect(at(final('census'), 'distant')).toMatchObject({ square: 'h2', possibleTypes: ['p'] });
    expect(final('census').zappedSquares).toEqual([]);
    expect(final('census').healedSquares).toEqual([]);
  });
  it('distinguishes an attack from a capture and heals both protected allies jointly', () => {
    expect(final('zap').zappedSquares).toEqual(['f6']);
    expect(at(final('zap'), 'target')).toMatchObject({ captured: false, square: 'f6', possibleTypes: ['r'] });
    expect(final('heal').healedSquares).toEqual(['d5', 'h5']);
    expect(at(final('heal'), 'bishop').possibleTypes).toEqual(['p', 'b']);
    expect(at(final('heal'), 'pawn').possibleTypes).toEqual(['p', 'b']);
  });
  it('uses real castling destinations, en passant timing, and promotion origins', () => {
    expect(at(final('castle'), 'left')).toMatchObject({ square: 'c1', castled: true, possibleTypes: ['r', 'k'] });
    expect(at(final('castle'), 'right')).toMatchObject({ square: 'd1', castled: true });
    const ep = createRuleExample('enpassant');
    expect(ep.frames[1].lastMove).toMatchObject({ isDoubleStep: true, crossedSquare: 'd6' });
    expect(() => advanceRuleExample(ep.frames[1].pieces, ep.steps[1], null)).toThrow(/window/);
    expect(at(ep.frames[2], 'victim').captured).toBe(true);
    expect(at(ep.frames[2], 'mover').square).toBe('d6');
    expect(at(final('promotion'), 'mover')).toMatchObject({ square: 'c8', wasPromoted: true, baseTypes: [], promoTypes: ['n', 'b', 'r', 'q'] });
  });
  it('shows a direct shield on a superposed target, a census collapse, and check with a legal escape', () => {
    const example = createRuleExample('shield');
    for (const id of ['left', 'right']) expect(at(example.frames[0], id).possibleTypes).toEqual(['q', 'k']);
    const attacked = example.frames[1];
    expect(attacked.zappedSquares).toEqual(['b3']);
    expect(attacked.fizzledSquares).toEqual(['f3']);
    expect(at(attacked, 'left')).toMatchObject({ captured: false, possibleTypes: ['k'] });
    expect(at(attacked, 'right')).toMatchObject({ captured: false, possibleTypes: ['q'] });
    expect(hasCollapsedKingCapturable(attacked.pieces, 'black')).toBe(true);
    expect(evaluateTerminalAfterMove(attacked.pieces, 'white', 32)).toBe(null);
    expect(generateLegalReplies(attacked.pieces, 'black', 32, attacked.lastMove)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'move', from: 'b3', to: 'a3' }),
    ]));
    expect(at(example.frames[2], 'left').square).toBe('a3');
    expect(hasCollapsedKingCapturable(example.frames[2].pieces, 'black')).toBe(false);
  });
  it('shields a definite non-King without making it immune to capture', () => {
    const frame = final('definite-shield');
    expect(frame.zappedSquares).toEqual([]);
    expect(frame.fizzledSquares).toEqual(['f6']);
    expect(at(frame, 'target')).toMatchObject({ square: 'f6', captured: false, possibleTypes: ['r'] });
    const capture = generateLegalReplies(frame.pieces, 'white', 32).find((reply) => reply.from === 'e4' && reply.to === 'f6');
    expect(capture).toBeDefined();
    expect(capture.resultPieces.find((p) => p.id === 'target').captured).toBe(true);
  });
  it('demonstrates a shielded King in checkmate and a different King in stalemate', () => {
    expect(final('king').fizzledSquares).toEqual(['a8']);
    expect(evaluateTerminalAfterMove(final('king').pieces, 'white', 32)).toBe('checkmate');
    expect(final('draw').fizzledSquares).toEqual([]);
    expect(hasCollapsedKingCapturable(final('draw').pieces, 'black')).toBe(false);
    expect(evaluateTerminalAfterMove(final('draw').pieces, 'white', 32)).toBe('stalemate');
  });
});
