// frontend/src/utils/rng.js
// Purpose: Deterministic seeding shared by everything that must be
// reproducible from a string seed alone — the daily puzzle generator, the
// engine fixture generator, and the puzzle miner. Never Math.random() here.
// Imports From: None
// Exported To: ../puzzle/puzzleGenerator.js, ../../tests/fixtureUtil.mjs

// Deterministic 32-bit PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// djb2 string hash → unsigned 32-bit, used to derive mulberry32 seeds.
export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
