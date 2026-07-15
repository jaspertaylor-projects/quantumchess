import { describe, expect, it } from 'vitest';
import { advanceEntry, makeInitialSnapshot } from '../src/chessboard/advanceCore.js';
import {
  canRunIntroReply,
  INTRO_DIALOGUE,
  INTRO_GUIDE,
  INTRO_SCRIPT,
  INTRO_TURNS,
} from '../src/hooks/introSequenceData.js';

describe('first-visit intro game', () => {
  it('keeps the forced White line and every scripted Black reply legal', () => {
    expect(INTRO_GUIDE).toHaveLength(INTRO_SCRIPT.length);

    let snapshot = makeInitialSnapshot();
    const history = [snapshot];

    for (let i = 0; i < INTRO_GUIDE.length; i += 1) {
      const whiteMove = INTRO_GUIDE[i].candidates?.[0];
      const blackMove = INTRO_SCRIPT[i].moves?.[0];
      expect(whiteMove, `White intro move ${i + 1}`).toBeTruthy();
      expect(blackMove, `Black intro reply ${i + 1}`).toBeTruthy();

      for (const [from, to] of [whiteMove, blackMove]) {
        const result = advanceEntry(snapshot, { type: 'move', from, to, enPassant: false }, history);
        expect(result.ok, `${snapshot.sideToMove} ${from}-${to}`).toBe(true);
        snapshot = result.snap;
        history.push(snapshot);
      }
    }

    expect(snapshot.sideToMove).toBe('white');
    expect(snapshot.gameOver).toBe(false);
  });

  it('keeps each explanation and intervening reply in the same round', () => {
    expect(INTRO_TURNS).toHaveLength(6);
    for (let i = 0; i < INTRO_TURNS.length; i += 1) {
      const turn = INTRO_TURNS[i];
      expect(turn.afterWhite).toBeTruthy();
      expect(turn.afterBlack).toBeTruthy();
      expect(INTRO_GUIDE[i]).toEqual({
        candidates: [turn.white],
        stage: `after-white-${i}`,
      });
      expect(INTRO_SCRIPT[i]).toMatchObject({
        moves: [turn.black],
        stage: `after-black-${i}`,
      });
      expect(INTRO_DIALOGUE[`after-white-${i}`]).toBe(turn.afterWhite);
      expect(INTRO_DIALOGUE[`after-black-${i}`]).toBe(turn.afterBlack);
    }
  });

  it('never allows Black to reply before the post-White checkpoint continues', () => {
    const blackTurn = {
      scriptOn: true,
      gameStarted: true,
      gameOver: false,
      sideToMove: 'black',
    };
    expect(canRunIntroReply({ ...blackTurn, needsContinue: true })).toBe(false);
    expect(canRunIntroReply({ ...blackTurn, needsContinue: false })).toBe(true);
  });
});
