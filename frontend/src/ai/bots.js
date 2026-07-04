// frontend/src/ai/bots.js
// Purpose: The bot roster — 12 opponents (4 easy, 4 medium, 4 hard), each a
// physicist × chess-legend mashup with a made-up rating and a personality
// expressed as search-config and evaluation-weight overrides for the engine.
// Avatar images: drop a PNG at frontend/public/bots/<id>.png and it is used
// automatically; otherwise a procedural initials avatar renders (hue below).
// Imports From: None
// Exported To: ./aiWorker.js, ./useLocalAi.js, ../tray/NewGamePanel.jsx, ../App.jsx

export const BOTS = [
  // ------------------------------ EASY ------------------------------
  {
    id: 'isaac-steinitz',
    name: 'Isaac Steinitz',
    rating: 1180,
    tier: 'easy',
    tagline: 'Classical foundations, occasionally asleep under the apple tree.',
    hue: 28,
    search: { noise: 1.5, timeMs: 700 },
    weights: { center: 0.05, development: 0.09 },
  },
  {
    id: 'emmy-menchik',
    name: 'Emmy Menchik',
    rating: 1250,
    tier: 'easy',
    tagline: 'Conserves material the way her theorems conserve everything else.',
    hue: 320,
    search: { noise: 1.2, timeMs: 800 },
    weights: { hangUndefended: 1.05, hangBadTrade: 0.65 },
  },
  {
    id: 'galileo-greco',
    name: 'Galileo Greco',
    rating: 1310,
    tier: 'easy',
    tagline: 'And yet, it attacks. Romantic gambits, dubious telescopes.',
    hue: 0,
    search: { noise: 1.1, timeMs: 800 },
    weights: { kingHunt: 0.3, soleKingAttacked: 5, hangUndefended: 0.6 },
  },
  {
    id: 'wolfgang-nimzowitsch',
    name: 'Wolfgang Nimzowitsch',
    rating: 1370,
    tier: 'easy',
    tagline: 'His exclusion principle: no two of your pieces may occupy good squares.',
    hue: 200,
    search: { noise: 0.9, timeMs: 900 },
    weights: { extraType: 0.14, mobility: 0.018 },
  },

  // ----------------------------- MEDIUM -----------------------------
  {
    id: 'boris-bohr',
    name: 'Boris Bohr',
    rating: 1520,
    tier: 'medium',
    tagline: 'Plays both interpretations until you disagree with him.',
    hue: 210,
    search: { noise: 0.35 },
    weights: {},
  },
  {
    id: 'marie-polgar',
    name: 'Marie Polgar',
    rating: 1590,
    tier: 'medium',
    tagline: 'Twice decorated, radiating tactics.',
    hue: 150,
    search: { noise: 0.15 },
    weights: { kingHunt: 0.22, oppDamage: 0.055, hangBadTrade: 0.6 },
  },
  {
    id: 'enrico-capablanca',
    name: 'Enrico Capablanca',
    rating: 1660,
    tier: 'medium',
    tagline: 'Back-of-the-envelope endgames, accurate to one significant figure.',
    hue: 45,
    search: { noise: 0 },
    weights: { center: 0.05, development: 0.08, pawnRace: 0.045, mobility: 0.016 },
  },
  {
    id: 'erwin-fischer',
    name: 'Erwin Fischer',
    rating: 1730,
    tier: 'medium',
    tagline: 'The piece is both winning and losing until he opens the box.',
    hue: 265,
    search: { noise: 0, widths: [40, 14], timeMs: 6000 },
    weights: { kingHunt: 0.25, oppDamage: 0.06, extraType: 0.11 },
  },

  // ------------------------------ HARD ------------------------------
  {
    id: 'gary-oppenheimer',
    name: 'Gary Oppenheimer',
    rating: 1820,
    tier: 'hard',
    tagline: 'Now I am become decoherence, destroyer of superpositions.',
    hue: 180,
    search: {},
    weights: { hangUndefended: 1.0, hangBadTrade: 0.65, kingSpread: 0.36 },
  },
  {
    id: 'werner-karpov',
    name: 'Werner Karpov',
    rating: 1890,
    tier: 'hard',
    tagline: 'The more precisely he fixes your position, the less momentum you keep.',
    hue: 95,
    search: {},
    weights: { mobility: 0.02, center: 0.045, extraType: 0.11, development: 0.075 },
  },
  {
    id: 'nikola-tal',
    name: 'Nikola Tal',
    rating: 1960,
    tier: 'hard',
    tagline: 'Lightning-coil sacrifices. Take the piece; the current comes with it.',
    hue: 285,
    search: { widths: [22, 12, 9] },
    weights: { kingHunt: 0.32, soleKingAttacked: 5.5, oppDamage: 0.06, hangUndefended: 0.7 },
  },
  {
    id: 'magnus-einstein',
    name: 'Magnus Einstein',
    rating: 2080,
    tier: 'hard',
    tagline: 'The final boss. God does not play dice — and neither does he.',
    hue: 215,
    search: { timeMs: 13500, widths: [24, 12, 10] },
    weights: { kingHunt: 0.2, mobility: 0.016, center: 0.04 },
  },
];

export const DEFAULT_BOT_ID = 'boris-bohr';

export function getBotById(id) {
  return BOTS.find((b) => b.id === id) || null;
}

export function botInitials(bot) {
  if (!bot || !bot.name) return '?';
  return bot.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
