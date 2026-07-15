import { describe, expect, it } from 'vitest';
import {
  gradeOfStanding,
  puzzleFinalScore,
  puzzleLetterGrade,
} from '../src/puzzle/puzzleScoring.js';

const standing = (landed, overrides = {}) => ({
  rank: 90,
  total: 100,
  best: 10,
  loss: 10 - landed,
  landed,
  ...overrides,
});

describe('mined-puzzle move grades', () => {
  it('keeps the best move as a star', () => {
    expect(gradeOfStanding(standing(-4, { rank: 1, loss: 0 }))).toBe('*');
  });

  it('makes any evaluation below -4 a dead skull regardless of rank', () => {
    expect(gradeOfStanding(standing(-4.01, { rank: 1, loss: 0 }))).toBe('s');
    expect(gradeOfStanding(standing(-4, { rank: 1, loss: 0 }))).toBe('*');
  });

  it('enforces the absolute evaluation floors', () => {
    expect(gradeOfStanding(standing(5, { rank: 90, loss: 5 }))).toBe('y');
    expect(gradeOfStanding(standing(5.01, { rank: 90, loss: 1.5 }))).toBe('g');
    expect(gradeOfStanding(standing(2))).toBe('y');
    expect(gradeOfStanding(standing(0))).toBe('o');
    expect(gradeOfStanding(standing(-1.99))).toBe('s');
    expect(gradeOfStanding(standing(-2))).toBe('s');
  });

  it('caps a move at yellow when it loses more than 1.5 evaluation points', () => {
    expect(gradeOfStanding(standing(6, { rank: 2, loss: 1.5 }))).toBe('g');
    expect(gradeOfStanding(standing(6, { rank: 2, loss: 1.51 }))).toBe('y');
    expect(gradeOfStanding(standing(-0.01, { rank: 2, loss: 1.51 }))).toBe('o');
  });

  it('downgrades every color by one step when the move lands below zero', () => {
    expect(gradeOfStanding(standing(-0.01, { rank: 2, loss: 0.5 }))).toBe('y');
    expect(gradeOfStanding(standing(-0.01, { rank: 20, loss: 1.5 }))).toBe('o');
    expect(gradeOfStanding(standing(-0.01, { rank: 40, loss: 2.5 }))).toBe('r');
    expect(gradeOfStanding(standing(-1, { rank: 70, loss: 3.5 }))).toBe('s');
    expect(gradeOfStanding(standing(0, { rank: 2, loss: 0.5 }))).toBe('g');
  });

  it('applies the negative-eval downgrade after the relative cutoffs', () => {
    expect(gradeOfStanding(standing(-4, { rank: 50, loss: 3 }))).toBe('r');
    expect(gradeOfStanding(standing(-4, { rank: 75, loss: 4 }))).toBe('s');
    expect(gradeOfStanding(standing(-4, { rank: 76, loss: 4.01 }))).toBe('s');
  });
});

describe('mined-puzzle final score', () => {
  it('maps -3 to 0 and the starting maximum to 100', () => {
    expect(puzzleFinalScore(-3, 5)).toBe(0);
    expect(puzzleFinalScore(1, 5)).toBe(50);
    expect(puzzleFinalScore(5, 5)).toBe(100);
  });

  it('clamps the final score to the 0-100 scale', () => {
    expect(puzzleFinalScore(-4, 5)).toBe(0);
    expect(puzzleFinalScore(7, 5)).toBe(100);
  });

  it('assigns standard letter grades', () => {
    expect(puzzleLetterGrade(100)).toBe('A');
    expect(puzzleLetterGrade(89)).toBe('B');
    expect(puzzleLetterGrade(79)).toBe('C');
    expect(puzzleLetterGrade(69)).toBe('D');
    expect(puzzleLetterGrade(59)).toBe('F');
  });
});
