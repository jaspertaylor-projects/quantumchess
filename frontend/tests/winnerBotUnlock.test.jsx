import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import WinnerModal from '../src/components/WinnerModal.jsx';
import { FREE_BOTS, PREMIUM_BOTS } from '../src/ai/bots.js';

describe('winner bot unlock reward', () => {
  it('uses the shared red modal close control on game-over screens', () => {
    const html = renderToStaticMarkup(
      <WinnerModal open title="Draw" winnerText="Draw by agreement." />
    );
    expect(html).toContain('qc-icon-button qc-winner-close');
    expect(html).toContain('aria-label="Close game over screen"');
  });

  it('shows three personalities and clearly labels a gated choice', () => {
    const candidates = [FREE_BOTS[1], FREE_BOTS[2], PREMIUM_BOTS[0]];
    const html = renderToStaticMarkup(
      <WinnerModal
        open
        winnerText="White wins by checkmate!"
        botUnlockReward={{ status: 'choices', candidates, accountAccess: 'free' }}
      />
    );
    for (const bot of candidates) {
      expect(html).toContain(bot.name);
      expect(html).toContain(bot.tagline.replaceAll("'", '&#x27;'));
    }
    expect(html).toContain('UNLOCK WITH PREMIUM');
    expect(html).toContain('Choose your next bot to unlock');
  });

  it('asks an anonymous winner to create or sign in to an account', () => {
    const html = renderToStaticMarkup(
      <WinnerModal
        open
        winnerText="White wins by checkmate!"
        botUnlockReward={{ status: 'signed-out', candidates: [], accountAccess: 'free' }}
      />
    );
    expect(html).toContain('Sign In or Create Account');
    expect(html).toContain('choose and keep new bot unlocks after every win');
  });
});
