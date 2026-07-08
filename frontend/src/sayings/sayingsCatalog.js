// frontend/src/sayings/sayingsCatalog.js
// Purpose: Event-triggered player sayings shown as speech bubbles on the
// player bars. Players never type free text — each event's saying is picked
// from the character roster (../characters/characterCatalog.js): a pick is a
// character id, and it resolves to that character's line for the event. Only
// unlocked characters are selectable (starter always; premium with the paid
// tier; quest via future profile.unlocked_characters).
// Imports From: ../characters/characterCatalog.js
// Exported To: ../App.jsx, ./SayingsEditor.jsx, ../account/AccountModal.jsx

import { getCharacterById, unlockedCharacters } from '../characters/characterCatalog.js';

// The five game events that can trigger a saying.
export const SAYING_EVENTS = [
  { key: 'win', label: 'On win' },
  { key: 'loss', label: 'On loss' },
  { key: 'draw', label: 'On draw' },
  { key: 'capture', label: 'On capture' },
  { key: 'collapse', label: 'On collapsing their whole army' },
];

// Retired preset table (pre-character builds stored 'p1'…'p8' per event).
// Kept so old saved picks keep resolving; new picks are character ids only.
const LEGACY_PRESETS = {
  win: {
    p1: 'Good game!', p2: 'GG — well played.', p3: 'Checkmate, delivered.',
    p4: 'The wavefunction favored me.', p5: 'Collapsed in my favor.',
    p6: 'Entangled, outplayed, checkmated.', p7: 'Measured. Found winning.',
    p8: 'Superposition? Super position.',
  },
  loss: {
    p1: 'Well played!', p2: 'GG, you got me.', p3: 'Ouch. Rematch?',
    p4: 'Decohered at the worst moment.', p5: 'I collapsed under observation.',
    p6: 'You saw through every superposition.', p7: 'My pieces chose the wrong reality.',
    p8: 'Uncertainty got the better of me.',
  },
  draw: {
    p1: 'Good game — dead even.', p2: 'A fair split.', p3: 'Neither of us blinked.',
    p4: 'Perfectly balanced superposition.', p5: 'The universe couldn’t decide either.',
    p6: 'Half a point in every branch.', p7: 'Entangled to the very end.',
    p8: 'Schrödinger’s result: we both won and lost.',
  },
  capture: {
    p1: 'Got one!', p2: 'Mine now.', p3: 'Thanks for that.',
    p4: 'Measured — and removed.', p5: 'Observed. Collapsed. Captured.',
    p6: 'One less possibility for you.', p7: 'Your amplitude just dropped.',
    p8: 'Decoherence: applied.',
  },
  collapse: {
    p1: 'Your whole army is collapsed!', p2: 'No more secrets on your side.',
    p3: 'Everything measured!', p4: 'Total decoherence achieved.',
    p5: 'Every wavefunction, accounted for.', p6: 'I can see all your pieces — can you?',
    p7: 'Reality check: complete.', p8: 'The fog has lifted. It’s all real now.',
  },
};

// Default speaker for players who never picked anything: Pip the pawn bot.
export const DEFAULT_CHARACTER_ID = 'pawn';
export const DEFAULT_SAYINGS = {
  win: DEFAULT_CHARACTER_ID,
  loss: DEFAULT_CHARACTER_ID,
  draw: DEFAULT_CHARACTER_ID,
  capture: DEFAULT_CHARACTER_ID,
  collapse: DEFAULT_CHARACTER_ID,
};

// The selectable lines for one event: every unlocked character's line,
// labeled by character so the picker reads as a cast list.
export function sayingOptionsForEvent(eventKey, { isPaid = false, unlockedIds = [] } = {}) {
  return unlockedCharacters({ isPaid, unlockedIds })
    .filter((c) => c.sayings && c.sayings[eventKey])
    .map((c) => ({ id: c.id, name: c.name, tier: c.tier, text: c.sayings[eventKey] }));
}

// The selectable taglines: one per unlocked character.
export function taglineOptions({ isPaid = false, unlockedIds = [] } = {}) {
  return unlockedCharacters({ isPaid, unlockedIds })
    .filter((c) => c.tagline)
    .map((c) => ({ id: c.id, name: c.name, tier: c.tier, tagline: c.tagline }));
}

// Signed-out players keep their picks in localStorage (character ids only).
const LOCAL_SAYINGS_KEY = 'qcSayings';

function isLegacyPresetId(v) {
  return typeof v === 'string' && /^p\d{1,2}$/.test(v);
}

function sanitizePicks(raw) {
  const clean = {};
  if (raw && typeof raw === 'object') {
    for (const ev of SAYING_EVENTS) {
      const v = raw[ev.key];
      if (typeof v !== 'string') continue;
      if (getCharacterById(v) || isLegacyPresetId(v)) clean[ev.key] = v;
    }
  }
  return clean;
}

export function loadLocalSayings() {
  try {
    return sanitizePicks(JSON.parse(localStorage.getItem(LOCAL_SAYINGS_KEY) || '{}'));
  } catch (_) {
    return {};
  }
}

export function saveLocalSayings(picks) {
  const clean = sanitizePicks(picks);
  try {
    localStorage.setItem(LOCAL_SAYINGS_KEY, JSON.stringify(clean));
  } catch (_) { /* private mode etc. — picks just won't persist */ }
  return clean;
}

// A profile's sayings value is { [event]: '<characterId>' } (or a legacy
// 'p#' preset id from older saves). Free text is retired: anything that is
// neither a known character nor a legacy preset falls back to the default
// character's line instead of rendering user-typed content.
export function resolveSaying(sayings, eventKey) {
  const value = (sayings && sayings[eventKey]) || DEFAULT_SAYINGS[eventKey];
  if (isLegacyPresetId(value)) {
    const text = (LEGACY_PRESETS[eventKey] || {})[value];
    if (text) return text;
  }
  const character = getCharacterById(value) || getCharacterById(DEFAULT_CHARACTER_ID);
  return (character && character.sayings && character.sayings[eventKey]) || null;
}