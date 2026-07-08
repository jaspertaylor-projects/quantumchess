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

function sanitizePicks(raw) {
  const clean = {};
  if (raw && typeof raw === 'object') {
    for (const ev of SAYING_EVENTS) {
      const v = raw[ev.key];
      if (typeof v !== 'string') continue;
      if (getCharacterById(v)) clean[ev.key] = v;
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

// A profile's sayings value is { [event]: '<characterId>' }. Free text is
// retired: anything that isn't a known character id falls back to the
// default character's line instead of rendering user-typed content.
export function resolveSaying(sayings, eventKey) {
  const value = (sayings && sayings[eventKey]) || DEFAULT_SAYINGS[eventKey];
  const character = getCharacterById(value) || getCharacterById(DEFAULT_CHARACTER_ID);
  return (character && character.sayings && character.sayings[eventKey]) || null;
}