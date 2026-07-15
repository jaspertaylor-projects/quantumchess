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
  it('preserves the authored move sequence exactly', () => {
    expect(INTRO_TURNS.map(({ white, black }) => ({ white, black }))).toEqual([
      { white: { from: 'e2', to: 'e4' }, black: { from: 'g8', to: 'f6' } },
      { white: { from: 'f1', to: 'c4' }, black: { from: 'b8', to: 'c6' } },
      { white: { from: 'd2', to: 'd4' }, black: { from: 'd7', to: 'd5' } },
      { white: { from: 'b2', to: 'b3' }, black: { from: 'c6', to: 'd4' } },
      { white: { from: 'f2', to: 'd4' }, black: { from: 'c7', to: 'c6' } },
      { white: { from: 'e4', to: 'd5' }, black: { castle: ['f8', 'h8'] } },
      { white: { from: 'd5', to: 'c6' }, black: { from: 'd8', to: 'd6' } },
      { white: { from: 'c6', to: 'd7', enPassant: true }, black: { from: 'e7', to: 'e1' } },
      { white: { from: 'd7', to: 'c8' }, black: { from: 'e8', to: 'e2' } },
      { white: { from: 'd4', to: 'c5' }, black: undefined },
    ]);
  });

  it('keeps the forced White line and every scripted Black reply legal', () => {
    expect(INTRO_GUIDE).toHaveLength(INTRO_TURNS.length);
    expect(INTRO_SCRIPT).toHaveLength(INTRO_TURNS.filter((turn) => turn.black).length);

    let snapshot = makeInitialSnapshot();
    const history = [snapshot];

    for (let i = 0; i < INTRO_TURNS.length; i += 1) {
      const turn = INTRO_TURNS[i];
      const whiteResult = advanceEntry(snapshot, {
        type: 'move',
        from: turn.white.from,
        to: turn.white.to,
        enPassant: Boolean(turn.white.enPassant),
      }, history);
      expect(whiteResult.ok, `white ${turn.white.from}-${turn.white.to}`).toBe(true);
      snapshot = whiteResult.snap;
      history.push(snapshot);

      if (!turn.black) continue;
      const blackEntry = turn.black.castle
        ? { type: 'castle', piece1_from: turn.black.castle[0], piece2_from: turn.black.castle[1] }
        : { type: 'move', from: turn.black.from, to: turn.black.to, enPassant: false };
      const blackResult = advanceEntry(snapshot, blackEntry, history);
      expect(blackResult.ok, `black reply after round ${i + 1}`).toBe(true);
      snapshot = blackResult.snap;
      history.push(snapshot);
    }

    expect(snapshot.sideToMove).toBe('black');
    expect(snapshot.gameOver).toBe(false);
  });

  it('keeps each explanation and intervening reply in the same round', () => {
    expect(INTRO_TURNS).toHaveLength(10);
    let scriptIndex = 0;
    for (let i = 0; i < INTRO_TURNS.length; i += 1) {
      const turn = INTRO_TURNS[i];
      expect(turn.afterWhite).toBeTruthy();
      expect(INTRO_GUIDE[i]).toEqual({
        candidates: [turn.white],
        stage: `after-white-${i}`,
        completeAfterWhite: Boolean(turn.completeAfterWhite),
      });
      expect(INTRO_DIALOGUE[`after-white-${i}`]).toBe(turn.afterWhite);

      if (!turn.black) continue;
      expect(turn.afterBlack).toBeTruthy();
      expect(INTRO_SCRIPT[scriptIndex]).toMatchObject({ stage: `after-black-${i}` });
      if (turn.black.castle) {
        expect(INTRO_SCRIPT[scriptIndex].castles).toEqual([turn.black.castle]);
      } else {
        expect(INTRO_SCRIPT[scriptIndex].moves).toEqual([[turn.black.from, turn.black.to]]);
      }
      expect(INTRO_DIALOGUE[`after-black-${i}`]).toBe(turn.afterBlack);
      scriptIndex += 1;
    }
  });

  it('splits dense explanations into short, acknowledged pages', () => {
    expect(INTRO_TURNS[0].afterBlack).toHaveLength(2);
    expect(INTRO_TURNS[1].afterWhite).toHaveLength(2);
    expect(INTRO_TURNS[1].afterBlack).toHaveLength(2);
    expect(INTRO_TURNS[4].afterBlack).toHaveLength(2);
    expect(INTRO_TURNS[6].afterBlack).toHaveLength(2);
    expect(INTRO_TURNS[8].afterBlack).toHaveLength(2);
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
