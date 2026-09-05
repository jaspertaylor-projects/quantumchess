// Purpose: Synthesize the short electronic-rustle move sound and its heavier
// capture counterpart with Web Audio. No downloaded or licensed audio assets.

let audioContext = null;

function contextConstructor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

function getContext() {
  // Mobile browsers can permanently close a context under memory pressure.
  // Holding that dead instance made every later move silently no-op.
  if (audioContext && audioContext.state !== 'closed') return audioContext;
  audioContext = null;
  const AudioContextClass = contextConstructor();
  if (!AudioContextClass) return null;
  try {
    audioContext = new AudioContextClass();
    return audioContext;
  } catch (_) {
    return null;
  }
}

function makeNoise(ctx, duration) {
  const frames = Math.max(1, Math.ceil(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i += 1) {
    // Correlated noise reads more like leaves/twigs than a flat radio hiss.
    const white = (Math.random() * 2) - 1;
    last = (last * 0.62) + (white * 0.38);
    data[i] = last;
  }
  return buffer;
}

function scheduleRustle(ctx, capture) {
  const now = ctx.currentTime + 0.006;
  const duration = capture ? 0.22 : 0.135;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(capture ? 0.682 : 0.572, now + 0.012);
  master.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  master.connect(ctx.destination);

  // A narrow, quickly sweeping noise band makes the electronic branch/leaf
  // texture. The capture opens the filter and lands lower and harder.
  const noise = ctx.createBufferSource();
  noise.buffer = makeNoise(ctx, duration);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(capture ? 220 : 520, now);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.setValueAtTime(capture ? 0.9 : 1.35, now);
  bandpass.frequency.setValueAtTime(capture ? 2800 : 3600, now);
  bandpass.frequency.exponentialRampToValueAtTime(capture ? 750 : 1200, now + duration);
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(capture ? 0.95 : 1.1, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  noise.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + duration + 0.01);

  // Three tiny digital twig snaps keep the sound crisp on phone speakers.
  const snapTimes = capture ? [0.004, 0.032, 0.071] : [0.003, 0.027, 0.058];
  snapTimes.forEach((offset, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index === 1 ? 'square' : 'triangle';
    const startHz = (capture ? 1280 : 2200) + (index * 370);
    osc.frequency.setValueAtTime(startHz, now + offset);
    osc.frequency.exponentialRampToValueAtTime(
      capture ? 310 : 820,
      now + offset + (capture ? 0.055 : 0.033),
    );
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(capture ? 0.28 : 0.22, now + offset + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + (capture ? 0.06 : 0.038));
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + offset);
    osc.stop(now + offset + (capture ? 0.065 : 0.043));
  });

  // A very short mid-frequency body makes the rustle survive laptop and
  // phone speakers. It stays underneath the noise/snaps, so the result still
  // reads as an electronic branch movement rather than a chess-clock beep.
  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(capture ? 540 : 760, now);
  body.frequency.exponentialRampToValueAtTime(capture ? 170 : 260, now + (capture ? 0.12 : 0.085));
  bodyGain.gain.setValueAtTime(capture ? 0.2 : 0.16, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + (capture ? 0.13 : 0.095));
  body.connect(bodyGain);
  bodyGain.connect(master);
  body.start(now);
  body.stop(now + (capture ? 0.135 : 0.1));

  if (capture) {
    // A compact low thump supplies force without turning the effect into an
    // explosion or masking the game's particle sounds.
    const impact = ctx.createOscillator();
    const impactGain = ctx.createGain();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(145, now);
    impact.frequency.exponentialRampToValueAtTime(52, now + 0.12);
    impactGain.gain.setValueAtTime(0.42, now);
    impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    impact.connect(impactGain);
    impactGain.connect(master);
    impact.start(now);
    impact.stop(now + 0.16);
  }
}

export function committedMoveIsCapture(result) {
  return Boolean(result && Array.isArray(result.records)
    && result.records.some((record) => Boolean(record && record.capture)));
}

export function positionAddedCapture(beforePieces, afterPieces) {
  if (!Array.isArray(beforePieces) || !Array.isArray(afterPieces)) return false;
  const previouslyLive = new Set(
    beforePieces.filter((piece) => piece && !piece.captured).map((piece) => piece.id),
  );
  return afterPieces.some((piece) => piece && piece.captured && previouslyLive.has(piece.id));
}

export function primeMoveAudio() {
  const ctx = getContext();
  if (!ctx || !ctx.state || ctx.state === 'running') return;
  try { ctx.resume().catch(() => {}); } catch (_) { /* unsupported/blocked */ }
}

export function playMoveSound({ capture = false, enabled = true } = {}) {
  if (!enabled) return false;
  const ctx = getContext();
  if (!ctx) return false;
  const play = () => {
    try { scheduleRustle(ctx, Boolean(capture)); } catch (_) { /* audio is cosmetic */ }
  };
  // Safari uses `interrupted` in addition to the standard `suspended` state.
  // Resume every non-running context while this call is still inside the
  // move gesture; a suspended-only check reported success but produced air.
  if (ctx.state && ctx.state !== 'running') {
    if (typeof ctx.resume !== 'function') return false;
    try { ctx.resume().then(play).catch(() => {}); } catch (_) { return false; }
  } else {
    play();
  }
  return true;
}

export function playCommittedMoveSound(result, enabled = true) {
  return playMoveSound({ capture: committedMoveIsCapture(result), enabled });
}

// Test-only reset keeps fake AudioContext instances isolated between cases.
export function __resetMoveAudioForTests() {
  audioContext = null;
}
