// frontend/src/hooks/introSequenceData.js
// Purpose: Single ordered source of truth for the first-visit opening. Each
// round owns White's forced move and explanation plus Black's intervening
// reply and follow-up prompt, preventing dialogue from drifting across turns.

export const INTRO_TURNS = [
  {
    white: ['e2', 'e4'],
    afterWhite: 'Your e-pawn claimed the center. This move made no contact, so nothing was zapped or healed.',
    black: ['g8', 'f6'],
    afterBlack: 'My g8 piece leapt to f6 and zapped e4. Now follow the glow from f1 to c4.',
    delay: 1100,
  },
  {
    white: ['f1', 'c4'],
    afterWhite: 'Your c4 piece reached f7 and zapped it. Enemy pieces you touch lose their most valuable clean possibility.',
    black: ['b8', 'c6'],
    afterBlack: 'I developed my other knight to c6. Your next move is d2 to d4.',
    delay: 1500,
  },
  {
    white: ['d2', 'd4'],
    afterWhite: 'Your d-pawn took space in the center. It made no contact yet—but your next move will support it.',
    black: ['b7', 'b5'],
    afterBlack: 'I pushed b7 to b5 and zapped your piece on c4. Now play c2 to c3.',
    delay: 1500,
  },
  {
    white: ['c2', 'c3'],
    afterWhite: 'Your c3 piece touched the friendly piece on d4, so d4 healed and regained a possible identity.',
    black: ['b5', 'c4'],
    afterBlack: 'I captured on c4. A captured quantum piece resolves as the least valuable identity it could still be. Now play f2 to f4.',
    delay: 1500,
  },
  {
    white: ['f2', 'f4'],
    afterWhite: 'Your f-pawn advanced without making contact. Quiet moves can still reshape which identities remain available.',
    black: ['d7', 'd5'],
    afterBlack: 'My d5 move healed c4 and zapped e4. Follow the final glow from e1 to f3.',
    delay: 1500,
  },
  {
    white: ['e1', 'f3'],
    afterWhite: 'Your f3 piece touched its friend on d4, healing it again. Friendly contact restores the cheapest feasible identity.',
    black: ['h7', 'e4'],
    afterBlack: 'You are a fast learner. Do you think you can beat me?',
    delay: 1500,
    complete: true,
  },
];

export const INTRO_GUIDE = INTRO_TURNS.map((turn, index) => ({
  candidates: [turn.white],
  stage: `after-white-${index}`,
}));

export const INTRO_SCRIPT = INTRO_TURNS.map((turn, index) => ({
  moves: [turn.black],
  stage: `after-black-${index}`,
  delay: turn.delay,
  complete: Boolean(turn.complete),
}));

export const INTRO_DIALOGUE = {
  welcome: 'Every piece begins as every piece. Follow the glow and play e2 to e4.',
  ...Object.fromEntries(INTRO_TURNS.flatMap((turn, index) => [
    [`after-white-${index}`, turn.afterWhite],
    [`after-black-${index}`, turn.afterBlack],
  ])),
};

// Pure gate used by the hook and regression tests: a Black reply may never
// run while its preceding post-White explanation awaits acknowledgement.
export function canRunIntroReply({ scriptOn, needsContinue, gameStarted, gameOver, sideToMove }) {
  return Boolean(scriptOn && !needsContinue && gameStarted && !gameOver && sideToMove === 'black');
}
