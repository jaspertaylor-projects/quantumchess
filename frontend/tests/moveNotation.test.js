import { describe, expect, it } from 'vitest';
import { formatMoveLabel } from '../src/tray/MoveHistoryPanel.jsx';

describe('move-history notation', () => {
  it('uses a dash for a quiet move', () => {
    expect(formatMoveLabel({ from: 'e2', to: 'e4', capture: false })).toBe('e2 – e4');
  });

  it('uses a multiplication cross for a capture', () => {
    expect(formatMoveLabel({ from: 'e4', to: 'd5', capture: true })).toBe('e4 × d5');
  });
});
