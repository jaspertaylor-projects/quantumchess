// frontend/src/puzzle/minedGameLoader.js
// Purpose: DEV-ONLY loader for the mined-game viewer (?minedGame=N). Reads
// game N of ./minedGamesData.json (extracted from a miner report's `games`
// array — bot names, result, stored-format moves, and the miner's probe
// evals) and shapes it for the existing ReviewModal plus its evalTrace
// graph strip.
// Imports From: ./minedGamesData.json (dynamic)
// Exported To: ../App.jsx (dynamic import, dev builds only)

export async function loadMinedGame(idx) {
  const data = (await import('./minedGamesData.json')).default;
  const g = data.games[idx];
  if (!g) {
    console.warn(`[minedGame] no game ${idx}; fixture has 0..${data.games.length - 1}`);
    return null;
  }
  console.info(`[minedGame] game ${g.gameIdx}: ${g.white} vs ${g.black} — ${g.result.winner || 'draw'} (${g.result.reason}), ${g.plies} plies, ${(g.evals || []).length} eval probes`);
  return {
    game: {
      headline: `${g.white} vs ${g.black} · ${g.result.winner || 'draw'} (${g.result.reason})`,
      user_side: 'white',
      result: g.result.winner || 'draw',
    },
    moves: g.moves,
    showEvalGraph: true, // graph values are computed client-side, parity-matched
  };
}
