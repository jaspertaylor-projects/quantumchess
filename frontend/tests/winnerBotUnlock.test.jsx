import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WinnerModal from '../src/components/WinnerModal.jsx';
import { MATCH_UNLOCK_BOTS } from '../src/ai/bots.js';

describe('human-match result reward', () => {
  it('announces an automatic unlock even after a draw, preserving the human rematch action', () => {
    const html = renderToStaticMarkup(<WinnerModal open title="Draw" winnerText="Draw by agreement."
      onPlayAgain={() => {}} botUnlockReward={{ status: 'unlocked', bot: MATCH_UNLOCK_BOTS[0] }} />);
    expect(html).toContain('Emmy Menchik unlocked!');
    expect(html).toContain('win, lose or draw');
    expect(html).toContain('saved to your account');
    expect(html).toContain('Play Emmy Menchik');
    expect(html).toContain('Play Again');
    expect(html).not.toContain('UNLOCK WITH PREMIUM');
    expect(html).toContain('aria-label="Close game over screen"');
  });
  it('shows completion for the earned roster without claiming Premium is unlocked', () => {
    const html = renderToStaticMarkup(<WinnerModal open botUnlockReward={{ status: 'complete' }} />);
    expect(html).toContain('all 15 match-unlocked bots');
    expect(html).not.toContain('entire active bot roster');
  });
  it('makes storage scope and retry failures clear', () => {
    const guest = renderToStaticMarkup(<WinnerModal open botUnlockReward={{ status: 'unlocked', bot: MATCH_UNLOCK_BOTS[0], guest: true }} />);
    expect(guest).toContain('saved on this browser');
    const failed = renderToStaticMarkup(<WinnerModal open botUnlockReward={{ status: 'error', error: 'Could not save.' }} />);
    expect(failed).toContain('Retry unlock');
    expect(failed).not.toContain('unlocked!');
  });
});
