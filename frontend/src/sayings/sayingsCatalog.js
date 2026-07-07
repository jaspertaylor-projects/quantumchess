// frontend/src/sayings/sayingsCatalog.js
// Purpose: Event-triggered player sayings ("GG", quantum trash talk) shown
// as speech bubbles on the player bars. Free accounts pick from the first
// few presets per event; premium unlocks the full list plus custom text
// (enforced server-side by the qc_profiles sayings trigger).
// Imports From: None
// Exported To: ../App.jsx, ../account/AccountModal.jsx

// The five game events that can trigger a saying.
export const SAYING_EVENTS = [
  { key: 'win', label: 'On win' },
  { key: 'loss', label: 'On loss' },
  { key: 'draw', label: 'On draw' },
  { key: 'capture', label: 'On capture' },
  { key: 'collapse', label: 'On collapsing their whole army' },
];

// Preset ids are stable ('p1'...'p8') — profiles store the id, not the text,
// so wording can be polished later without touching saved profiles. The
// first FREE_PRESET_COUNT of each list are available to free accounts.
export const FREE_PRESET_COUNT = 3;

export const SAYING_PRESETS = {
  win: [
    { id: 'p1', text: 'Good game!' },
    { id: 'p2', text: 'GG — well played.' },
    { id: 'p3', text: 'Checkmate, delivered.' },
    { id: 'p4', text: 'The wavefunction favored me.' },
    { id: 'p5', text: 'Collapsed in my favor.' },
    { id: 'p6', text: 'Entangled, outplayed, checkmated.' },
    { id: 'p7', text: 'Measured. Found winning.' },
    { id: 'p8', text: 'Superposition? Super position.' },
  ],
  loss: [
    { id: 'p1', text: 'Well played!' },
    { id: 'p2', text: 'GG, you got me.' },
    { id: 'p3', text: 'Ouch. Rematch?' },
    { id: 'p4', text: 'Decohered at the worst moment.' },
    { id: 'p5', text: 'I collapsed under observation.' },
    { id: 'p6', text: 'You saw through every superposition.' },
    { id: 'p7', text: 'My pieces chose the wrong reality.' },
    { id: 'p8', text: 'Uncertainty got the better of me.' },
  ],
  draw: [
    { id: 'p1', text: 'Good game — dead even.' },
    { id: 'p2', text: 'A fair split.' },
    { id: 'p3', text: 'Neither of us blinked.' },
    { id: 'p4', text: 'Perfectly balanced superposition.' },
    { id: 'p5', text: 'The universe couldn’t decide either.' },
    { id: 'p6', text: 'Half a point in every branch.' },
    { id: 'p7', text: 'Entangled to the very end.' },
    { id: 'p8', text: 'Schrödinger’s result: we both won and lost.' },
  ],
  capture: [
    { id: 'p1', text: 'Got one!' },
    { id: 'p2', text: 'Mine now.' },
    { id: 'p3', text: 'Thanks for that.' },
    { id: 'p4', text: 'Measured — and removed.' },
    { id: 'p5', text: 'Observed. Collapsed. Captured.' },
    { id: 'p6', text: 'One less possibility for you.' },
    { id: 'p7', text: 'Your amplitude just dropped.' },
    { id: 'p8', text: 'Decoherence: applied.' },
  ],
  collapse: [
    { id: 'p1', text: 'Your whole army is collapsed!' },
    { id: 'p2', text: 'No more secrets on your side.' },
    { id: 'p3', text: 'Everything measured!' },
    { id: 'p4', text: 'Total decoherence achieved.' },
    { id: 'p5', text: 'Every wavefunction, accounted for.' },
    { id: 'p6', text: 'I can see all your pieces — can you?' },
    { id: 'p7', text: 'Reality check: complete.' },
    { id: 'p8', text: 'The fog has lifted. It’s all real now.' },
  ],
};

export const MAX_CUSTOM_SAYING_LENGTH = 120;

// Default per-event choice for anonymous players, the local "Stranger",
// and signed-in profiles that never picked anything.
export const DEFAULT_SAYINGS = { win: 'p1', loss: 'p1', draw: 'p1', capture: 'p1', collapse: 'p1' };

export function presetsForEvent(eventKey, isPaid) {
  const list = SAYING_PRESETS[eventKey] || [];
  return isPaid ? list : list.slice(0, FREE_PRESET_COUNT);
}

// Signed-out players keep their picks in localStorage (preset ids only —
// custom text stays a premium account feature).
const LOCAL_SAYINGS_KEY = 'qcSayings';

function sanitizePresetPicks(raw) {
  const clean = {};
  if (raw && typeof raw === 'object') {
    for (const ev of SAYING_EVENTS) {
      const v = raw[ev.key];
      if (typeof v === 'string' && /^p\d{1,2}$/.test(v)) clean[ev.key] = v;
    }
  }
  return clean;
}

export function loadLocalSayings() {
  try {
    return sanitizePresetPicks(JSON.parse(localStorage.getItem(LOCAL_SAYINGS_KEY) || '{}'));
  } catch (_) {
    return {};
  }
}

export function saveLocalSayings(picks) {
  const clean = sanitizePresetPicks(picks);
  try {
    localStorage.setItem(LOCAL_SAYINGS_KEY, JSON.stringify(clean));
  } catch (_) { /* private mode etc. — picks just won't persist */ }
  return clean;
}

// A profile's sayings value is { [event]: 'p3' | 'any custom text' }.
// Preset ids resolve through the catalog; anything else is custom text
// (premium) and renders as-is.
export function resolveSaying(sayings, eventKey) {
  const value = (sayings && sayings[eventKey]) || DEFAULT_SAYINGS[eventKey];
  if (!value) return null;
  if (/^p\d{1,2}$/.test(value)) {
    const preset = (SAYING_PRESETS[eventKey] || []).find((p) => p.id === value);
    return preset ? preset.text : null;
  }
  return String(value).slice(0, MAX_CUSTOM_SAYING_LENGTH);
}
