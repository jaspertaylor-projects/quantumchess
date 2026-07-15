// Suppress noisy mistake symbols once the same side remains decisively ahead.
// Crossing from one winning side to the other must still be marked.
export function staysInSameDecisiveBand(before, after, threshold = 8) {
  if (!Number.isFinite(before) || !Number.isFinite(after)) return false;
  return (before > threshold && after > threshold)
    || (before < -threshold && after < -threshold);
}
