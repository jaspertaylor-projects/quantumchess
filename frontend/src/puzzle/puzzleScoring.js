// frontend/src/puzzle/puzzleScoring.js
// Purpose: Pure scoring rules shared by the mined-puzzle UI and its tests.

export const PUZZLE_GRADES = {
  STAR: '*',
  GREEN: 'g',
  YELLOW: 'y',
  ORANGE: 'o',
  RED: 'r',
  SKULL: 's',
};

const NEGATIVE_EVAL_DOWNGRADE = {
  [PUZZLE_GRADES.GREEN]: PUZZLE_GRADES.YELLOW,
  [PUZZLE_GRADES.YELLOW]: PUZZLE_GRADES.ORANGE,
  [PUZZLE_GRADES.ORANGE]: PUZZLE_GRADES.RED,
  [PUZZLE_GRADES.RED]: PUZZLE_GRADES.SKULL,
};

// Rank/loss rewards the move relative to its position. Absolute evaluation
// gates prevent a move that preserves a clearly winning position from
// receiving an unduly harsh grade.
export function gradeOfStanding(standing) {
  if (!standing) return PUZZLE_GRADES.RED;
  const { rank, total, loss, landed } = standing;
  const frac = rank / Math.max(1, total);
  if (landed < -4) return PUZZLE_GRADES.SKULL;
  if (rank === 1) return PUZZLE_GRADES.STAR;
  let grade;
  if (loss <= 1 || frac <= 0.10 || landed >= 4) grade = PUZZLE_GRADES.GREEN;
  else if (loss <= 2 || frac <= 0.25 || landed >= 2) grade = PUZZLE_GRADES.YELLOW;
  else if (loss <= 3 || frac <= 0.50 || landed >= 0) grade = PUZZLE_GRADES.ORANGE;
  else if (loss <= 4 || frac <= 0.75 || landed > -2) grade = PUZZLE_GRADES.RED;
  else grade = PUZZLE_GRADES.SKULL;
  return landed < 0 ? (NEGATIVE_EVAL_DOWNGRADE[grade] || grade) : grade;
}

// The final score maps the requested interval linearly: -3 is zero, and the
// best evaluation available at the start of the puzzle is 100. Clamp the
// public result to its advertised 0-100 scale.
export function puzzleFinalScore(finalLanding, startingMaxEval) {
  if (!Number.isFinite(finalLanding) || !Number.isFinite(startingMaxEval)) return 0;
  const span = startingMaxEval + 3;
  if (span <= 0) return finalLanding >= startingMaxEval ? 100 : 0;
  return Math.min(100, Math.round(100 * Math.max(0, finalLanding + 3) / span));
}

export function puzzleLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}
