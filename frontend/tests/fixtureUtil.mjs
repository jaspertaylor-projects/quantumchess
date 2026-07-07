// frontend/tests/fixtureUtil.mjs
// Purpose: Shared helpers for the engine replay fixtures — a seeded PRNG for
// the generator and a stable string hash so fixtures can pin every snapshot's
// position signature without storing the (large) signatures themselves.
// Imports From: None
// Exported To: ./generate-engine-fixtures.mjs, ./engineReplay.test.js

// Deterministic 32-bit PRNG (mulberry32). Never Math.random(): fixtures must
// be reproducible from the seed alone.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a 32-bit, hex string. Collisions are astronomically unlikely across a
// few thousand snapshots, and a false negative would only surface as a test
// failure pointing at a real place to look.
export function hashSig(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
