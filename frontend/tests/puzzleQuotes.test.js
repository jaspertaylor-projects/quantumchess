// Purpose: Pin the daily-quote contract — a full year of unique, well-formed
// chess×physics mashup quotes and a deterministic per-date picker that
// matches the daily puzzle's day-number math.

import { describe, expect, it } from 'vitest';
import {
  PUZZLE_AUTHOR_COOLDOWN_DAYS,
  PUZZLE_QUOTES,
  puzzleQuoteForDate,
} from '../src/puzzle/puzzleQuotes.js';

const OFF_TOPIC_BYLINES = [
  'Kennedy', 'Churchill', 'Roosevelt', 'Shakespeare', 'Picasso', 'Socrates',
  'Laozi', 'Nietzsch', 'Muhammad', 'Napoleon', 'Caesar', 'Sun Tzu', 'Steve Job',
  'Douglas Adams', 'Thomas Edison', 'Martin Luther', 'Mahatma', 'Neil Armstrong',
];

describe('puzzle quotes', () => {
  it('holds a full year of unique, well-formed quotes', () => {
    expect(PUZZLE_QUOTES.length).toBeGreaterThanOrEqual(365);
    const texts = new Set(PUZZLE_QUOTES.map((x) => x.q));
    expect(texts.size).toBe(PUZZLE_QUOTES.length);
    for (const { q, by } of PUZZLE_QUOTES) {
      expect(q.trim().length).toBeGreaterThan(10);
      expect(q.length).toBeLessThanOrEqual(200);
      expect(by.trim().length).toBeGreaterThan(2);
    }
  });

  it('picks deterministically per date and rotates daily', () => {
    const a = puzzleQuoteForDate('2026-07-16');
    expect(a).toEqual(puzzleQuoteForDate('2026-07-16'));
    expect(puzzleQuoteForDate('2026-07-17')).not.toEqual(a);
    // A year from now cycles back to the same quote (365-entry rotation).
    expect(puzzleQuoteForDate('2027-07-16')).toEqual(a);
  });

  it('uses only the curated chess-and-science pool', () => {
    for (const { by } of PUZZLE_QUOTES) {
      for (const excluded of OFF_TOPIC_BYLINES) expect(by).not.toContain(excluded);
    }
  });

  it('keeps an author off the daily card for a full cooldown', () => {
    const recent = [];
    const start = Date.UTC(2026, 0, 1);
    for (let day = 0; day < PUZZLE_QUOTES.length * 2; day += 1) {
      const date = new Date(start + day * 86400000).toISOString().slice(0, 10);
      const quote = puzzleQuoteForDate(date);
      expect(recent).not.toContain(quote.by);
      recent.push(quote.by);
      if (recent.length > PUZZLE_AUTHOR_COOLDOWN_DAYS) recent.shift();
    }
  });

  it('returns null for non-date preview ids', () => {
    expect(puzzleQuoteForDate('#3')).toBeNull();
  });
});
