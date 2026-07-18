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
    };

    const state = settingsReducer(undefined, setGameSettings(queued));

    expect(state).toMatchObject(queued);
  });

  it('normalizes any submitted clock to the one canonical online format', () => {
    const state = settingsReducer(undefined, setGameSettings({ gameMode: 'online', timeControl: '10+0' }));
    expect(state.timeControl).toBe('5+5');
  });
});
