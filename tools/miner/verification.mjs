// Certify whole candidates. A sampled batch agreement percentage is not proof
// that an individual puzzle's full par line has survived deeper search.
export function verifyChains(candidates, { cap, verify }) {
  if (!Number.isInteger(cap) || cap < 0) throw new Error('verifyCap must be a non-negative integer');
  let attempted = 0;
  const verdicts = [];
  const chains = candidates.map(({ _verify = [], ...chain }, chainIndex) => {
    const required = chain.steps?.length || 0;
    const checks = [];
    // Budget whole lines, never certify the first half of a candidate.
    const completeLine = required > 0 && _verify.length === required
      && _verify.every((entry, index) => entry.plyIdx === index);
    if (completeLine && attempted + required <= cap) {
      for (const entry of _verify) {
        const result = verify(entry);
        attempted++;
        const verdict = {
          ...result,
          chainIndex,
          game: chain.game,
          startPly: chain.startPly,
          mirrored: Boolean(chain.mirrored),
          plyIdx: entry.plyIdx,
          parEval: entry.parEval,
        };
        checks.push(verdict);
        verdicts.push(verdict);
      }
    }
    const status = checks.some((check) => check.verdict === 'disagree') ? 'rejected'
      : checks.length === required && required > 0 && checks.every((check) => check.verdict === 'agree')
        ? 'verified' : 'incomplete';
    return {
      ...chain,
      // Even verified candidates need human curation before scheduling.
      devOnly: true,
      verification: { status, required, attempted: checks.length, verdicts: checks },
    };
  });
  const agreed = verdicts.filter((v) => v.verdict === 'agree').length;
  const timeouts = verdicts.filter((v) => v.verdict === 'timeout').length;
  const verifiedChainIndexes = chains.flatMap((c, i) => c.verification.status === 'verified' ? [i] : []);
  return {
    chains,
    gate: {
      attempted,
      verified: attempted - timeouts,
      agreed,
      timeouts,
      // Includes timeouts in the denominator; a timeout is not agreement.
      agreementRate: attempted ? Number((100 * agreed / attempted).toFixed(1)) : 0,
      threshold: 100,
      pass: chains.length > 0 && verifiedChainIndexes.length === chains.length,
      verifiedChainIndexes,
      rejectedChains: chains.filter((c) => c.verification.status === 'rejected').length,
      incompleteChains: chains.filter((c) => c.verification.status === 'incomplete').length,
      verdicts,
    },
  };
}
