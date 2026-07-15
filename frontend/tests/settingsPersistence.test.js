import { describe, expect, it } from 'vitest';
import settingsReducer, { setGameSettings } from '../src/store/settingsSlice.js';

describe('new-game settings persistence', () => {
  it('keeps the complete submitted setup for the next game panel', () => {
    const queued = {
      gameMode: 'online',
      aiBotId: 'marie-curie',
      aiDifficulty: 'hard',
      preferredSide: 'black',
      isRanked: true,
      timeControl: '10+0',
    };

    const state = settingsReducer(undefined, setGameSettings(queued));

    expect(state).toMatchObject(queued);
  });
});
