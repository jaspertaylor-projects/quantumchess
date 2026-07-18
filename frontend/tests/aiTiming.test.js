// Purpose: Keep profile-specific bot search budgets inside the UI worker
// watchdog, with enough room for startup and final message delivery.

import { describe, expect, it } from 'vitest';

import {
  AI_WORKER_GRACE_MS,
  MIN_AI_HARD_CAP_MS,
  aiWorkerHardCapMs,
  searchBudgetMs,
} from '../src/ai/aiTiming.js';
import { getBotById } from '../src/ai/bots.js';

describe('AI worker timing', () => {
  it('places Ernest\'s watchdog beyond his profile search deadline', () => {
    const ernest = getBotById('ernest-smyslov');
    expect(searchBudgetMs('hard', ernest)).toBe(15000);
    expect(aiWorkerHardCapMs('hard', ernest)).toBeGreaterThanOrEqual(15000 + AI_WORKER_GRACE_MS);
  });

  it('retains the legacy minimum cap for shorter searches', () => {
    const easy = getBotById('isaac-steinitz');
    expect(aiWorkerHardCapMs('easy', easy)).toBe(MIN_AI_HARD_CAP_MS);
  });
});
