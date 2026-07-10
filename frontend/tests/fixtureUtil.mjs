// frontend/tests/fixtureUtil.mjs
// Purpose: Shared helpers for the engine replay fixtures — a seeded PRNG for
// the generator and a stable string hash so fixtures can pin every snapshot's
// position signature without storing the (large) signatures themselves.
// Imports From: ../src/utils/rng.js
// Exported To: ./generate-engine-fixtures.mjs, ./engineReplay.test.js

// Deterministic PRNG shared with the app (utils/rng.js). Never Math.random():
// fixtures must be reproducible from the seed alone.
export { mulberry32 } from '../src/utils/rng.js';

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
