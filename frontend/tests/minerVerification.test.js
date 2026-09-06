import { describe, expect, it, vi } from 'vitest';
import { verifyChains } from '../../tools/miner/verification.mjs';
import { isDailyCandidate } from '../src/puzzle/minedPreview.js';

const candidate = (mirrored = false) => ({
  game: 2, startPly: 18, mirrored,
  steps: [{}, {}, {}],
  _verify: [0, 1, 2].map((plyIdx) => ({ plyIdx, parEval: 3 })),
});
const agree = () => ({ verdict: 'agree', depth: 8 });

describe('puzzle creation verification', () => {
  it('requires every ply and preserves the curation step', () => {
    const result = verifyChains([candidate()], { cap: 3, verify: agree });
    expect(result.gate.pass).toBe(true);
    expect(result.gate.verifiedChainIndexes).toEqual([0]);
    expect(result.chains[0].verification.status).toBe('verified');
    expect(result.chains[0]._verify).toBeUndefined();
    expect(isDailyCandidate(result.chains[0])).toBe(false);
    expect(isDailyCandidate({ ...result.chains[0], devOnly: false })).toBe(true);
  });

  it('does not let timeouts disappear from a passing batch', () => {
    const result = verifyChains([candidate()], {
      cap: 3, verify: (entry) => entry.plyIdx === 1 ? { verdict: 'timeout' } : agree(),
    });
    expect(result.gate).toMatchObject({ pass: false, timeouts: 1, attempted: 3, agreementRate: 66.7 });
    expect(result.gate.verdicts).toHaveLength(3);
    expect(result.chains[0].verification.status).toBe('incomplete');
    expect(isDailyCandidate({ ...result.chains[0], devOnly: false })).toBe(false);
  });

  it('budgets whole chains and distinguishes mirrored windows', () => {
    const verify = vi.fn(agree);
    const result = verifyChains([candidate(), candidate(true)], { cap: 5, verify });
    expect(verify).toHaveBeenCalledTimes(3);
    expect(result.gate.pass).toBe(false);
    expect(result.chains[1].verification.status).toBe('incomplete');
    const full = verifyChains([candidate(), candidate(true)], { cap: 6, verify: agree });
    expect(full.gate.verdicts[0]).toMatchObject({ chainIndex: 0, game: 2, mirrored: false });
    expect(full.gate.verdicts[3]).toMatchObject({ chainIndex: 1, game: 2, mirrored: true });
  });

  it('rejects an individual bad chain even when batch agreement exceeds 95%', () => {
    let calls = 0;
    const result = verifyChains(Array.from({ length: 10 }, () => candidate()), {
      cap: 30, verify: () => ++calls === 1 ? { verdict: 'disagree' } : agree(),
    });
    expect(result.gate.agreementRate).toBe(96.7);
    expect(result.gate.pass).toBe(false);
    expect(result.chains[0].verification.status).toBe('rejected');
    expect(result.gate.verifiedChainIndexes).not.toContain(0);
  });

  it('keeps disabled, absent and malformed verification unverified', () => {
    for (const cap of [0, 2]) {
      expect(verifyChains([candidate()], { cap, verify: agree }).gate.pass).toBe(false);
    }
    expect(verifyChains([], { cap: 3, verify: agree }).gate.pass).toBe(false);
    const malformed = { ...candidate(), _verify: [{ plyIdx: 0 }] };
    expect(verifyChains([malformed], { cap: 3, verify: agree }).gate.pass).toBe(false);
    expect(() => verifyChains([], { cap: NaN, verify: agree })).toThrow('verifyCap');
  });

  it('preserves existing curated dailies and blocks explicitly unverified candidates', () => {
    expect(isDailyCandidate({})).toBe(true);
    for (const status of ['pending', 'incomplete', 'rejected']) {
      expect(isDailyCandidate({ verification: { status } })).toBe(false);
    }
  });
});
