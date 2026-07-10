// frontend/src/ai/bots.js
// Purpose: The bot roster — 12 free opponents (4 easy, 4 medium, 4 hard)
// plus 12 premium-only bots, each a scientist × chess-legend mashup with a
// made-up rating and a personality expressed as search-config and
// evaluation-weight overrides for the engine.
// Legal guardrail: every character is a fictional parody composite. Never a
// real person's full name (first + surname always come from two different
// people), and avatar art must not depict a real person's likeness. The
// public disclaimer is on /about.html under "The characters".
// Avatar source of truth: this roster owns bot ids and tiers. Drop a PNG at
// frontend/public/bots/<id>.png and getBotAvatarUrl() will use it; otherwise
// the player bar falls back to procedural initials. Run `pnpm audit:avatars`
// to check that the files match this catalog.
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
    sayings: {
      win: 'The apple falls for everyone. Today, on you.',
      loss: 'Even gravity has off days.',
      draw: 'Equal and opposite.',
      capture: 'Action, reaction, capture.',
      collapse: 'All your bodies, observed and accounted for.',
    },
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
    sayings: {
      win: 'Victory was conserved from move one.',
      loss: 'My symmetry broke — well done.',
      draw: 'Perfectly conserved.',
      capture: 'That piece is conserved — on my side now.',
      collapse: 'Every invariant of yours is measured.',
    },
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
    sayings: {
      win: 'And yet, it wins.',
      loss: 'The tower leaned too far this time.',
      draw: 'The spheres are balanced.',
      capture: 'Dropped — like everything else from the tower.',
      collapse: 'I have observed all your moons.',
    },
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
    sayings: {
      win: 'Not even wrong — just beaten.',
      loss: 'An exclusion I did not foresee.',
      draw: 'We occupy the same state.',
      capture: 'Excluded from the board.',
      collapse: 'Every quantum number of yours, measured.',
    },
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
    sayings: {
      win: 'Both interpretations agreed: I win.',
      loss: 'In some interpretation, I won.',
      draw: 'Complementarity in action.',
      capture: 'The debate is settled — that piece is mine.',
      collapse: 'Your whole army finally decided what it is.',
    },
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
    sayings: {
      win: 'Radiant, isn\'t it?',
      loss: 'A rare decay indeed.',
      draw: 'A stable isotope of a game.',
      capture: 'Extracted, like radium from ore.',
      collapse: 'I\'ve irradiated every last uncertainty.',
    },
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
    sayings: {
      win: 'The back of my envelope said I\'d win.',
      loss: 'Off by one order of magnitude.',
      draw: 'Within experimental error.',
      capture: 'One piece, give or take zero.',
      collapse: 'Estimated, then confirmed: all of it.',
    },
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
    sayings: {
      win: 'The box is open. You lost.',
      loss: 'The box is open. I lost?',
      draw: 'The cat shrugged.',
      capture: 'Alive AND captured. Now just captured.',
      collapse: 'Every box on your side is open.',
    },
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
    sayings: {
      win: 'Now I am become victory.',
      loss: 'A chain reaction I couldn\'t stop.',
      draw: 'Critical mass, never reached.',
      capture: 'Vaporized.',
      collapse: 'Total decoherence. Nothing left uncertain.',
    },
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
    sayings: {
      win: 'You knew my position or my plan. Never both.',
      loss: 'I was certain. That was the problem.',
      draw: 'Precisely uncertain to the end.',
      capture: 'Located. Precisely. Fatally.',
      collapse: 'No uncertainty left anywhere on your side.',
    },
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
    sayings: {
      win: 'The current always finds a path.',
      loss: 'Blown fuse. Rematch.',
      draw: 'Alternating fortunes.',
      capture: 'Zap.',
      collapse: 'Your whole grid is lit.',
    },
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
    sayings: {
      win: 'God does not play dice. Neither do I.',
      loss: 'Spooky. Action at a distance indeed.',
      draw: 'Relatively even.',
      capture: 'That piece was pure energy. Was.',
      collapse: 'Everything observable has been observed.',
    },
    hue: 215,
    search: { timeMs: 13500, widths: [24, 12, 10] },
    weights: { kingHunt: 0.2, mobility: 0.016, center: 0.04 },
  },

  // ---------------------------- PREMIUM -----------------------------
  // Paid-tier roster (12 bots, 1300-2250, sorted by rating; the 2250 boss
  // outranks the whole free roster). `premium: true` gates them in
  // NewGamePanel; the engine treats them like any other bot of their tier.
  {
    id: 'freeman-morphy',
    name: 'Freeman Morphy',
    rating: 1300,
    tier: 'easy',
    tagline: 'Builds a sphere around your king and harvests the energy.',
    sayings: {
      win: 'Sphere complete. Energy harvested.',
      loss: 'A design flaw in my sphere.',
      draw: 'Two spheres, no sun.',
      capture: 'Absorbed into the sphere.',
      collapse: 'Your entire star system is mapped.',
    },
    hue: 240,
    premium: true,
    search: { noise: 1.0, timeMs: 900 },
    weights: { kingHunt: 0.28, soleKingAttacked: 5.2, development: 0.08 },
  },
  {
    id: 'fabiano-feynman',
    name: 'Fabiano Feynman',
    rating: 1450,
    tier: 'medium',
    tagline: 'Surely you’re joking — there’s plenty of room at the bottom of your position.',
    sayings: {
      win: 'Surely you\'re joking about that defense.',
      loss: 'Nature cannot be fooled. I can, apparently.',
      draw: 'Nature cannot be beaten today, either.',
      capture: 'Plenty of room at the bottom for that piece.',
      collapse: 'I\'ve drawn diagrams of your entire army.',
    },
    hue: 20,
    premium: true,
    search: { noise: 0.4 },
    weights: { oppDamage: 0.065, extraType: 0.13, mobility: 0.018 },
  },
  {
    id: 'nona-franklin',
    name: 'Nona Franklin',
    rating: 1550,
    tier: 'medium',
    tagline: 'Photographed the structure of your position long before you saw it.',
    sayings: {
      win: 'The structure was clear from photo 51.',
      loss: 'You read my diffraction pattern.',
      draw: 'Two helices, perfectly parallel.',
      capture: 'Crystallized and claimed.',
      collapse: 'Every strand of yours is imaged.',
    },
    hue: 350,
    premium: true,
    search: { noise: 0.3 },
    weights: { development: 0.085, kingSpread: 0.3, hangBadTrade: 0.62 },
  },
  {
    id: 'paul-penrose',
    name: 'Paul Penrose',
    rating: 1650,
    tier: 'medium',
    tagline: 'Draws impossible staircases. Your king climbs them forever.',
    sayings: {
      win: 'Your king ran out of staircase.',
      loss: 'I tiled myself into a corner.',
      draw: 'A perfectly aperiodic ending.',
      capture: 'One tile removed from your pattern.',
      collapse: 'The impossible object is complete.',
    },
    hue: 300,
    premium: true,
    search: { noise: 0.1 },
    weights: { extraType: 0.14, oppDamage: 0.06, kingHunt: 0.22 },
  },
  {
    id: 'james-kramnik',
    name: 'James Kramnik',
    rating: 1750,
    tier: 'medium',
    tagline: 'Unified your kingside and queenside weaknesses into one field.',
    sayings: {
      win: 'It was all one field in the end.',
      loss: 'My demon let the wrong piece through.',
      draw: 'Fields in equilibrium.',
      capture: 'Induced, and removed.',
      collapse: 'All your charges are measured.',
    },
    hue: 330,
    premium: true,
    search: { noise: 0 },
    weights: { development: 0.09, center: 0.05, extraType: 0.1 },
  },
  {
    id: 'hikaru-hawking',
    name: 'Hikaru Hawking',
    rating: 1850,
    tier: 'hard',
    tagline: 'Your king’s escape squares end at the event horizon.',
    sayings: {
      win: 'Past the event horizon, nothing escapes.',
      loss: 'Radiation leaked out — well spotted.',
      draw: 'Time ran flat.',
      capture: 'Spaghettified.',
      collapse: 'Your army\'s information has fully radiated away.',
    },
    hue: 190,
    premium: true,
    search: {},
    weights: { center: 0.045, development: 0.08, mobility: 0.017, hangUndefended: 0.85 },
  },
  {
    id: 'tigran-turing',
    name: 'Tigran Turing',
    rating: 1900,
    tier: 'hard',
    tagline: 'Ran the halting analysis on your attack. It doesn’t.',
    sayings: {
      win: 'Your attack halted after all.',
      loss: 'Undecidable — until it wasn\'t.',
      draw: 'The machine never halted.',
      capture: 'Decrypted and deleted.',
      collapse: 'Your entire cipher is broken.',
    },
    hue: 60,
    premium: true,
    search: {},
    weights: { hangUndefended: 0.95, kingSpread: 0.32, mobility: 0.018 },
  },
  {
    id: 'max-alekhine',
    name: 'Max Alekhine',
    rating: 1950,
    tier: 'hard',
    tagline: 'Energy is quantized. His attacks are not — they arrive continuously.',
    sayings: {
      win: 'Checkmate, delivered in one quantum.',
      loss: 'Below my measurement threshold.',
      draw: 'The smallest possible margin: zero.',
      capture: 'One quantum of material, please.',
      collapse: 'Resolved to the Planck scale.',
    },
    hue: 255,
    premium: true,
    search: {},
    weights: { kingHunt: 0.24, mobility: 0.018, center: 0.045, oppDamage: 0.055 },
  },
  {
    id: 'vera-krush',
    name: 'Vera Krush',
    rating: 2000,
    tier: 'hard',
    tagline: 'Found your position’s missing mass. It’s aimed at your king.',
    sayings: {
      win: 'The rotation curve pointed straight at mate.',
      loss: 'There was mass I never saw.',
      draw: 'Orbits stable, forever.',
      capture: 'Pulled in by dark gravity.',
      collapse: 'All of your dark matter is found.',
    },
    hue: 170,
    premium: true,
    search: {},
    weights: { pawnRace: 0.05, center: 0.05, mobility: 0.017, extraType: 0.11 },
  },
  {
    id: 'mikhail-faraday',
    name: 'Mikhail Faraday',
    rating: 2050,
    tier: 'hard',
    tagline: 'Induces a threat along every line you leave open.',
    sayings: {
      win: 'Induction complete.',
      loss: 'You cut my field lines.',
      draw: 'Flux, unchanged.',
      capture: 'Along the open line, as promised.',
      collapse: 'Every line of force is traced.',
    },
    hue: 130,
    premium: true,
    search: { widths: [22, 12, 9] },
    weights: { kingHunt: 0.24, oppDamage: 0.06, development: 0.075 },
  },
  {
    id: 'alexandra-payne',
    name: 'Alexandra Payne',
    rating: 2150,
    tier: 'hard',
    tagline: 'Worked out what your attack is made of. Mostly hydrogen.',
    sayings: {
      win: 'Stellar. Literally.',
      loss: 'A supernova I didn\'t predict.',
      draw: 'Two stars, one spectrum.',
      capture: 'Burned up on entry.',
      collapse: 'I\'ve read your whole army\'s spectrum.',
    },
    hue: 75,
    premium: true,
    search: { timeMs: 13500, widths: [24, 12, 10] },
    weights: { kingHunt: 0.26, oppDamage: 0.06, hangUndefended: 0.8 },
  },
  {
    id: 'ernest-anand',
    name: 'Ernest Anand',
    rating: 2250,
    tier: 'hard',
    tagline: 'The premium final boss. Your defense is mostly empty space — he fires straight through it.',
    sayings: {
      win: 'Straight through. As predicted.',
      loss: 'Sometimes the foil fires back.',
      draw: 'Scattered evenly.',
      capture: 'Direct hit on the nucleus.',
      collapse: 'All of your atoms are mapped.',
    },
    hue: 110,
    premium: true,
    search: { timeMs: 15000, widths: [26, 14, 10] },
    weights: { kingHunt: 0.26, soleKingAttacked: 5.5, oppDamage: 0.06, mobility: 0.017, hangUndefended: 0.8 },
  },
];

export const DEFAULT_BOT_ID = 'boris-bohr';

export const BOT_AVATAR_BASE = '/bots';

export function getBotAvatarUrl(botOrId) {
  const id = typeof botOrId === 'string' ? botOrId : botOrId && botOrId.id;
  return id ? `${BOT_AVATAR_BASE}/${id}.png` : null;
}

export const FREE_BOTS = BOTS.filter((b) => !b.premium);
export const PREMIUM_BOTS = BOTS.filter((b) => b.premium);

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

// The avatar descriptor PlayerBar consumes, built from a roster bot — shared
// by the live player bars and the review modal.
export function botAvatarDescriptor(bot) {
  if (!bot) return null;
  return { initials: botInitials(bot), hue: bot.hue ?? 200, imageUrl: getBotAvatarUrl(bot), name: bot.name, tagline: bot.tagline || '' };
}
