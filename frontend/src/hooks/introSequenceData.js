// frontend/src/hooks/introSequenceData.js
// Purpose: Single ordered source of truth for the first-visit lesson. Each
// round owns White's forced move and explanation plus Black's intervening
// reply and follow-up prompt, preventing dialogue from drifting across turns.

export const INTRO_TURNS = [
  {
    white: { from: 'e2', to: 'e4' },
    afterWhite: 'Your e-file piece claimed the center. Pawn, rook, and queen could all make that move, so its quantum superposition collapsed to those three possibilities.',
    black: { from: 'g8', to: 'f6' },
    afterBlack: [
      'My g8 piece made a knight leap to f6, resolving as a knight. In quantum terms, contact with an enemy partially observes that piece and removes its strongest possible identity. We call that a Zap.',
      'In chess terms, my knight attacked the piece on e4. In Quantum Chess, that means it contacted and zapped it. Notice that the queen is now missing from that piece’s possibilities. Now play f1 to c4.',
    ],
    delay: 1100,
  },
  {
    white: { from: 'f1', to: 'c4' },
    afterWhite: [
      'Only a bishop or queen could reach c4, so your piece now shows those two possibilities.',
      'A quantum piece makes contact using its least valuable remaining identity. Its bishop ray zapped f7—but its queen ray did not zap c7.',
    ],
    black: { from: 'b8', to: 'c6' },
    afterBlack: [
      'I developed my other knight to c6. Quantum Chess conserves one complete chess set, which contains only two knights. Both of mine are now revealed.',
      'Look across all my other pieces: the knight possibility has disappeared from every one of them. With both knights accounted for, none of those pieces can still be a knight. Now play d2 to d4.',
    ],
    delay: 1500,
  },
  {
    white: { from: 'd2', to: 'd4' },
    afterWhite: 'Your d-file piece took space in the center. It made no contact yet—but your next move will support the center.',
    black: { from: 'd7', to: 'd5' },
    afterBlack: 'I pushed d7 to d5, making contact with and zapping two pieces at once: c4 and e4. Now play b2 to b3.',
    delay: 1500,
  },
  {
    white: { from: 'b2', to: 'b3' },
    afterWhite: 'Your b3 piece became quantum-entangled with its friend on c4: a Heal. Friendly contact restores the cheapest feasible missing identity, so c4 regained pawn.',
    black: { from: 'c6', to: 'd4' },
    afterBlack: [
      'I captured your piece on d4. A captured superposition collapses to its least valuable remaining identity—in this case, a pawn. Look for it in my captured-pieces tray.',
      'Now recapture my knight by playing f2 to d4.',
    ],
    delay: 1500,
  },
  {
    white: { from: 'f2', to: 'd4' },
    afterWhite: 'AAARGH—you recaptured my knight on d4. I should have seen that coming.',
    black: { from: 'c7', to: 'c6' },
    afterBlack: [
      'My c7 piece moved to c6 and healed d5. Normally a Heal restores the least valuable feasible missing identity.',
      'Because both knights are already accounted for, the quantum census skipped knight and restored the next feasible identity: bishop. Capture from e4 to d5.',
    ],
    delay: 1500,
  },
  {
    white: { from: 'e4', to: 'd5' },
    afterWhite: 'A capture and a Zap in the same move: you took my d5 piece, then your contact zapped c6. Quantum cause and effect can make one move do a lot—you are getting the hang of this!',
    black: { castle: ['f8', 'h8'] },
    afterBlack: 'I quantum-castled. Once per game, you may castle any two back-rank pieces that can both still be rook or king — use it wisely. Now capture from d5 to c6.',
    delay: 1500,
  },
  {
    white: { from: 'd5', to: 'c6' },
    afterWhite: 'You captured the piece I placed on c6. Watch my next move carefully—it uses a pawn possibility from an unusual square.',
    black: { from: 'd8', to: 'd6' },
    afterBlack: [
      'My d8 piece could still be a pawn, so it moved two squares forward. Any possible pawn in its first two home ranks may double-step.',
      'Classical starting positions usually hide that pawn rule. Capture it en passant from c6 to d7.',
    ],
    delay: 1500,
  },
  {
    white: { from: 'c6', to: 'd7', enPassant: true },
    afterWhite: 'A counter-surprise! Even in Quantum Chess, en passant catches me every time. You captured the double-stepping pawn on d6 while landing on d7.',
    black: { from: 'e7', to: 'e1' },
    afterBlack: 'I crossed the board from e7 to e1 and infiltrated your back rank. Push d7 to c8 and promote.',
    delay: 1500,
  },
  {
    white: { from: 'd7', to: 'c8' },
    afterWhite: 'Quantum promotion! The promoted identity does not consume one of your original chess-set capacities, and the piece keeps its promotion bar for the rest of the game.',
    black: { from: 'e8', to: 'e2' },
    afterBlack: [
      'Oops—that move collapsed several possibilities. The conservation solver automatically updates the whole quantum army as possibilities change.',
      'It makes sure the surviving identities still fit one complete chess set. Finish the lesson with d4 to c5.',
    ],
    delay: 1500,
  },
  {
    white: { from: 'd4', to: 'c5' },
    afterWhite: 'The piece on f8 blocked your Zap with a shield. Removing its rook or king possibility would have forced spillover changes elsewhere, and a Zap may not cause that cascade—a capture can. You are a fast learner! Think you can beat me? The full Tutorial and Rules explore every quantum system in more depth. Play from here or start over.',
    completeAfterWhite: true,
  },
];

export const INTRO_GUIDE = INTRO_TURNS.map((turn, index) => ({
  candidates: [turn.white],
  stage: `after-white-${index}`,
  completeAfterWhite: Boolean(turn.completeAfterWhite),
}));

export const INTRO_SCRIPT = INTRO_TURNS.flatMap((turn, index) => {
  if (!turn.black) return [];
  return [{
    ...(turn.black.castle
      ? { castles: [turn.black.castle] }
      : { moves: [[turn.black.from, turn.black.to]] }),
    stage: `after-black-${index}`,
    delay: turn.delay,
  }];
});

export const INTRO_DIALOGUE = {
  welcome: 'Welcome to Quantum Chess. Every piece begins in a superposition of every identity. Follow the glow and play e2 to e4.',
  ...Object.fromEntries(INTRO_TURNS.flatMap((turn, index) => [
    [`after-white-${index}`, turn.afterWhite],
    ...(turn.afterBlack ? [[`after-black-${index}`, turn.afterBlack]] : []),
  ])),
};

// Pure gate used by the hook and regression tests: a Black reply may never
// run while its preceding post-White explanation awaits acknowledgement.
export function canRunIntroReply({ scriptOn, needsContinue, gameStarted, gameOver, sideToMove }) {
  return Boolean(scriptOn && !needsContinue && gameStarted && !gameOver && sideToMove === 'black');
}
