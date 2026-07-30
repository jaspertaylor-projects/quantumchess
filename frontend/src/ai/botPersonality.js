// Purpose: Root-move policies for bot personalities that cannot be expressed
// by static position weights alone. These policies sit above every search
// implementation, so a bot keeps its signature behavior as search depth and
// engine internals evolve.
// Imports From: None
// Exported To: ./alphaBetaEngine.js, ./fast/fastSearch.js,
//   ./fast/fastSearch2.js, ../../../tests/botPersonalities.test.js

export const ROOT_PERSONALITY = Object.freeze({
  EARLY_CASTLER: 'early-castler',
  COUNTERPUNCHER: 'counterpuncher',
});

export function isRecapture({ isCapture = false, to = null, lastMove = null } = {}) {
  return Boolean(
    isCapture
    && to
    && lastMove?.didCapture
    && lastMove.to === to,
  );
}

// The counterpuncher declines initiating captures whenever another legal
// move exists. Recaptures and mating captures always stay available; if every
// legal move captures, the full move list is restored so the bot cannot
// freeze or throw away a forced defense.
export function applyRootMovePolicy(entries, bot, factsFor) {
  if (bot?.personality !== ROOT_PERSONALITY.COUNTERPUNCHER) return entries;

  const patient = entries.filter((entry) => {
    const facts = factsFor(entry);
    return !facts.isCapture
      || facts.isMate
      || isRecapture(facts);
  });
  return patient.length > 0 ? patient : entries;
}

export function rootPersonalityBias(bot, {
  isCastle = false,
  isMate = false,
  sideMoveCount = 0,
  hasCastled = false,
} = {}) {
  if (isMate) return 0;
  if (
    bot?.personality === ROOT_PERSONALITY.EARLY_CASTLER
    && isCastle
    && !hasCastled
    && sideMoveCount <= 12
  ) {
    // Strong enough to make safe early castling characteristic, but small
    // enough that the search still rejects a castle that drops real material.
    return Math.max(1.4, 3.2 - sideMoveCount * 0.15);
  }
  return 0;
}
