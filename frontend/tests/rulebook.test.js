import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RULES } from '../src/rules/rulebook.js';
import { applyContactZapHeal, simulateStandardMove } from '../src/chessboard/quantumEngine.js';

const p = (id, side, square, types) => ({ id, side, square, possibleTypes: [...types], baseTypes: [...types], promoTypes: [], moveCount: 1, captured: !square, captureIndex: square ? null : 0 });
const rule = (id) => RULES.find((r) => r.id === id);
const resultTypes = (result, id) => result.pieces.find((piece) => piece.id === id).possibleTypes.join('');
const spare = () => [p('spare', 'white', 'h1', 'pnbrqk')];

describe('rulebook illustrations', () => {
  it('projects a diagonal move and a promotion through the current engine', () => {
    const diagonal = simulateStandardMove([p('m', 'white', 'e2', rule('measurement').before[0].types), ...spare()], 'm', 'g4', 0);
    expect(diagonal.ok).toBe(true);
    expect(resultTypes(diagonal, 'm')).toBe(rule('measurement').after[0].types);
    const promotion = simulateStandardMove([p('m', 'white', 'b7', 'p'), ...spare()], 'm', 'b8', 0);
    expect(promotion.ok).toBe(true);
    expect(resultTypes(promotion, 'm')).toBe(rule('promotion').after[0].types);
  });
  it('resolves zap, heal, and the final royal state as illustrated', () => {
    for (const id of ['zap', 'heal', 'royal']) {
      const r = rule(id);
      const side = id === 'heal' ? 'white' : 'black';
      const pieces = [p('m', 'white', 'e4', 'p'), ...spare(), p('target', side, 'd5', r.before[0].types)];
      if (id === 'zap') pieces.push(p('other-king', 'black', 'h8', 'pnbrqk'));
      const result = applyContactZapHeal(pieces, 'white', ['m']);
      expect(resultTypes(result, 'target'), id).toBe(r.after[0].types);
    }
  });
  it('resolves a captured Knight–Queen as Knight', () => {
    const result = simulateStandardMove([p('m', 'white', 'a1', 'r'), ...spare(), p('victim', 'black', 'a4', rule('capture').before[0].types)], 'm', 'a4', 0);
    expect(result.ok).toBe(true);
    expect(resultTypes(result, 'victim')).toBe(rule('capture').after[0].types);
  });
  it('propagates the illustrated census cascade to both distant pieces', () => {
    const r = rule('census');
    const squares = ['d5', 'e8', 'a8'];
    const pieces = [p('m', 'white', 'e4', 'p'), ...spare(), ...r.before.map((row, i) => p(squares[i], 'black', squares[i], row.types))];
    for (const [type, count] of Object.entries({ p: 8, n: 2, b: 2, r: 1 })) {
      for (let i = 0; i < count; i++) pieces.push(p(`${type}-${i}`, 'black', null, type));
    }
    const result = applyContactZapHeal(pieces, 'white', ['m']);
    squares.forEach((square, i) => expect(resultTypes(result, square)).toBe(r.after[i].types));
  });
  it('keeps the web rulebook aligned with the shared rule text', () => {
    const html = readFileSync(new URL('../public/rules.html', import.meta.url), 'utf8');
    for (const r of RULES) for (const text of [r.concept, r.summary, ...r.paragraphs, r.detail]) {
      expect(html).toContain(text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'));
    }
  });
});
