// frontend/src/ai/bots.js
// Purpose: The active 18-bot roster — six Free, six Supporter-or-Premium,
// and six Premium opponents — plus a shelved legacy roster retained only so
// old saved games can still resolve their opponent identity.
// Legal guardrail: both halves of every mashup must be deceased, and avatar
// art must not depict a real person's likeness or imply endorsement.
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
    personality: 'gravity-center',
    tagline: 'Pulls every piece toward the center, gravity permitting.',
    sayings: {
      win: 'The apple falls for everyone. Today, on you.',
      loss: 'Even gravity has off days.',
      draw: 'Equal and opposite.',
      capture: 'Action, reaction, capture.',
      collapse: 'All your bodies, observed and accounted for.',
    },
    hue: 28,
    search: { noise: 1.5, timeMs: 700 },
    weights: { center: 0.1, development: 0.12, mobility: 0.018 },
  },
  {
    id: 'emmy-menchik',
    name: 'Emmy Menchik',
    rating: 1250,
    tier: 'easy',
    personality: 'material-conservation',
    tagline: 'Conserves material, reinforces everything, and hates an uneven trade.',
    sayings: {
      win: 'Victory was conserved from move one.',
      loss: 'My symmetry broke — well done.',
      draw: 'Perfectly conserved.',
      capture: 'That piece is conserved — on my side now.',
      collapse: 'Every invariant of yours is measured.',
    },
    hue: 320,
    search: { noise: 1.2, timeMs: 800 },
    weights: { material: 1.25, hangUndefended: 1.2, hangBadTrade: 0.78, friendlyContact: 0.08 },
  },
  {
    id: 'galileo-greco',
    name: 'Galileo Greco',
    rating: 1310,
    tier: 'easy',
    personality: 'promotion-racer',
    tagline: 'Every pawn sees the eighth rank through a very optimistic telescope.',
    sayings: {
      win: 'And yet, it wins.',
      loss: 'The tower leaned too far this time.',
      draw: 'The spheres are balanced.',
      capture: 'Dropped — like everything else from the tower.',
      collapse: 'I have observed all your moons.',
    },
    hue: 0,
    search: { noise: 1.1, timeMs: 800 },
    weights: {
      pawnAdvance: 0.1, pawnRace: 0.08,
      promoNear: 3.2, promoImminent: 8.5, promoBank: 10,
      hangUndefended: 0.58,
    },
  },
  {
    id: 'wolfgang-nimzowitsch',
    name: 'Wolfgang Nimzowitsch',
    rating: 1370,
    tier: 'easy',
    personality: 'knight-collector',
    tagline: 'Protects every possible knight and posts them on exclusionary outposts.',
    sayings: {
      win: 'Not even wrong — just beaten.',
      loss: 'An exclusion I did not foresee.',
      draw: 'We occupy the same state.',
      capture: 'Excluded from the board.',
      collapse: 'Every quantum number of yours, measured.',
    },
    hue: 200,
    search: { noise: 0.9, timeMs: 900 },
    weights: { knightIdentity: 0.42, center: 0.06, mobility: 0.021, extraType: 0.12 },
  },

  // ----------------------------- MEDIUM -----------------------------
  {
    id: 'boris-bohr',
    name: 'Boris Bohr',
    rating: 1520,
    tier: 'medium',
    personality: 'superposition-maximalist',
    tagline: 'Keeps his army blurry while forcing yours to choose an interpretation.',
    sayings: {
      win: 'Both interpretations agreed: I win.',
      loss: 'In some interpretation, I won.',
      draw: 'Complementarity in action.',
      capture: 'The debate is settled — that piece is mine.',
      collapse: 'Your whole army finally decided what it is.',
    },
    hue: 210,
    search: { noise: 0.35 },
    weights: { extraType: 0.18, kingSpread: 0.4, friendlyContact: 0.07 },
  },
  {
    id: 'marie-lane',
    name: 'Marie Lane',
    rating: 1590,
    tier: 'medium',
    personality: 'zap-hunter',
    tagline: 'A reactor-hearted tactician who points every loose ray at a zap target.',
    sayings: {
      win: 'Radiant, isn\'t it?',
      loss: 'A rare decay indeed.',
      draw: 'A stable isotope of a game.',
      capture: 'Extracted from the reaction chamber.',
      collapse: 'Every last uncertainty is glowing now.',
    },
    hue: 150,
    search: { noise: 0.15 },
    weights: { extraType: 0.2, enemyContact: 0.24, kingHunt: 0.25, hangBadTrade: 0.58 },
  },
  {
    id: 'enrico-capablanca',
    name: 'Enrico Capablanca',
    rating: 1660,
    tier: 'medium',
    personality: 'healing-network',
    tagline: 'Builds a contact network where narrowed pieces keep healing each other.',
    sayings: {
      win: 'The back of my envelope said I\'d win.',
      loss: 'Off by one order of magnitude.',
      draw: 'Within experimental error.',
      capture: 'One piece, give or take zero.',
      collapse: 'Estimated, then confirmed: all of it.',
    },
    hue: 45,
    access: 'supporter',
    search: { noise: 0 },
    weights: {
      friendlyContact: 0.24, extraType: 0.16,
      hangUndefended: 1.0, hangBadTrade: 0.64,
      development: 0.08,
    },
  },
  {
    id: 'erwin-fischer',
    name: 'Erwin Fischer',
    rating: 1730,
    tier: 'medium',
    personality: 'wide-funnel',
    tagline: 'Opens every box, checks every reply, then follows two deep branches.',
    sayings: {
      win: 'The box is open. You lost.',
      loss: 'The box is open. I lost?',
      draw: 'The cat shrugged.',
      capture: 'Alive AND captured. Now just captured.',
      collapse: 'Every box on your side is open.',
    },
    hue: 265,
    access: 'supporter',
    search: {
      noise: 0, widths: [176, 176, 2, 2], adaptiveBeam: false,
      timeMs: 7000,
    },
    weights: { kingHunt: 0.22, center: 0.045, extraType: 0.11 },
  },

  // ------------------------------ HARD ------------------------------
  {
    id: 'akiba-oppenheimer',
    name: 'Akiba Oppenheimer',
    rating: 1820,
    tier: 'hard',
    personality: 'chain-reaction',
    tagline: 'Links friends and enemies into controlled heal-and-zap chain reactions.',
    sayings: {
      win: 'Containment held. Yours did not.',
      loss: 'A chain reaction I couldn\'t stop.',
      draw: 'Critical mass, never reached.',
      capture: 'Vaporized.',
      collapse: 'Total decoherence. Nothing left uncertain.',
    },
    hue: 180,
    access: 'supporter',
    search: {},
    weights: {
      enemyContact: 0.16, friendlyContact: 0.16, extraType: 0.16,
      hangUndefended: 0.95, hangBadTrade: 0.62, kingSpread: 0.36,
    },
  },
  {
    id: 'werner-lasker',
    name: 'Werner Lasker',
    rating: 1890,
    tier: 'hard',
    personality: 'positional-restriction',
    tagline: 'Occupies the useful coordinates until your whole army runs out of moves.',
    sayings: {
      win: 'Your last free coordinate is gone.',
      loss: 'I was certain. That was the problem.',
      draw: 'Precisely uncertain to the end.',
      capture: 'Located. Precisely. Fatally.',
      collapse: 'No uncertainty left anywhere on your side.',
    },
    hue: 95,
    access: 'premium',
    search: { widths: [28, 18, 12, 10] },
    weights: { mobility: 0.03, center: 0.075, extraType: 0.11, development: 0.1, enemyContact: 0.07 },
  },
  {
    id: 'nikola-tal',
    name: 'Nikola Tal',
    rating: 1960,
    tier: 'hard',
    personality: 'sacrificial-attack',
    tagline: 'Lightning-coil sacrifices: take the piece and the mating current follows.',
    sayings: {
      win: 'The current always finds a path.',
      loss: 'Blown fuse. Rematch.',
      draw: 'Alternating fortunes.',
      capture: 'Zap.',
      collapse: 'Your whole grid is lit.',
    },
    hue: 285,
    access: 'premium',
    search: { widths: [24, 14, 11] },
    weights: {
      material: 0.86, kingHunt: 0.42,
      soleKingAttacked: 6.2, soleKingCollapsedAttacked: 9,
      hangUndefended: 0.56, enemyContact: 0.1,
    },
  },
  {
    id: 'rudolf-einstein',
    name: 'Rudolf Einstein',
    rating: 2080,
    tier: 'hard',
    personality: 'complete-player',
    tagline: 'A complete player: tactics, structure, promotion, defense, and mate.',
    sayings: {
      win: 'I carried every branch to the same ending.',
      loss: 'One world slipped off my shoulders.',
      draw: 'Two worlds, perfectly balanced.',
      capture: 'That piece was pure energy. Was.',
      collapse: 'Everything observable has been observed.',
    },
    hue: 215,
    access: 'premium',
    search: { timeMs: 13500, widths: [32, 20, 14, 12] },
    weights: {
      material: 1.05, mobility: 0.02, center: 0.05,
      extraType: 0.12, kingSpread: 0.32,
      hangUndefended: 0.98, hangBadTrade: 0.64,
      pawnRace: 0.045, promoNear: 2.2, promoImminent: 6.8, promoBank: 8.5,
      kingHunt: 0.24, enemyContact: 0.06, friendlyContact: 0.06,
      mopUpEdge: 0.42, mopUpClose: 0.3,
    },
  },

  // ------------------------ EXPANDED ROSTER -------------------------
  // Six of these legacy identities have returned to the active ladder. The
  // remaining six stay readable for old saves but remain shelved.
  {
    id: 'freeman-morphy',
    name: 'Freeman Morphy',
    rating: 1680,
    tier: 'medium',
    access: 'supporter',
    personality: 'early-castler',
    tagline: 'Builds his king a castled Dyson sphere before harvesting yours.',
    sayings: {
      win: 'Sphere complete. Energy harvested.',
      loss: 'A design flaw in my sphere.',
      draw: 'Two spheres, no sun.',
      capture: 'Absorbed into the sphere.',
      collapse: 'Your entire star system is mapped.',
    },
    hue: 240,
    search: { noise: 0, timeMs: 5200 },
    weights: {
      kingHunt: 0.24, soleKingAttacked: 5.2,
      development: 0.1, hangUndefended: 0.96,
    },
  },
  {
    id: 'david-feynman',
    name: 'David Feynman',
    rating: 1760,
    tier: 'medium',
    access: 'supporter',
    personality: 'counterpuncher',
    tagline: 'Never draws the first capture arrow—then calculates the recapture.',
    sayings: {
      win: 'The winning line fit in the margin.',
      loss: 'My diagram omitted one important arrow.',
      draw: 'Two diagrams, same conclusion.',
      capture: 'Adding that piece to the diagram.',
      collapse: 'I\'ve drawn diagrams of your entire army.',
    },
    hue: 20,
    search: { noise: 0, timeMs: 6200 },
    weights: {
      material: 1.12, extraType: 0.13, mobility: 0.02,
      hangUndefended: 1.08, hangBadTrade: 0.72,
    },
  },
  {
    id: 'edith-franklin',
    name: 'Edith Franklin',
    rating: 1840,
    tier: 'medium',
    access: 'supporter',
    personality: 'structure-photographer',
    tagline: 'Develops a crystal-clear structure and reinforces every weak bond.',
    sayings: {
      win: 'The structure was visible in every turn.',
      loss: 'You read my diffraction pattern.',
      draw: 'Two helices, perfectly parallel.',
      capture: 'Crystallized and claimed.',
      collapse: 'Every strand of yours is imaged.',
    },
    hue: 350,
    search: { noise: 0, timeMs: 7600, widths: [46, 18, 12] },
    weights: {
      development: 0.14, center: 0.065, friendlyContact: 0.11,
      kingSpread: 0.34, hangUndefended: 1.12, hangBadTrade: 0.76,
    },
  },
  {
    id: 'savielly-dirac',
    name: 'Savielly Dirac',
    rating: 1920,
    tier: 'hard',
    access: 'premium',
    personality: 'maze-maker',
    tagline: 'Draws impossible staircases until your king has no legal landing.',
    sayings: {
      win: 'Your king ran out of staircase.',
      loss: 'I tiled myself into a corner.',
      draw: 'A perfectly aperiodic ending.',
      capture: 'One tile removed from your pattern.',
      collapse: 'The impossible object is complete.',
    },
    hue: 300,
    search: { noise: 0, widths: [26, 16, 11] },
    weights: {
      mobility: 0.034, center: 0.07, extraType: 0.15,
      kingHunt: 0.3, hangUndefended: 0.94,
    },
  },
  {
    id: 'james-euwe',
    name: 'James Euwe',
    rating: 2010,
    tier: 'hard',
    access: 'premium',
    personality: 'field-unifier',
    tagline: 'Unifies heal networks and zap pressure into one force field.',
    sayings: {
      win: 'It was all one field in the end.',
      loss: 'My demon let the wrong piece through.',
      draw: 'Fields in equilibrium.',
      capture: 'Induced, and removed.',
      collapse: 'All your charges are measured.',
    },
    hue: 330,
    search: { noise: 0, widths: [30, 18, 12] },
    weights: {
      development: 0.1, center: 0.055, extraType: 0.16,
      enemyContact: 0.17, friendlyContact: 0.17,
      kingSpread: 0.36, hangBadTrade: 0.66,
    },
  },
  {
    id: 'stephen-reti',
    name: 'Stephen Reti',
    rating: 2140,
    tier: 'hard',
    access: 'premium',
    personality: 'event-horizon',
    tagline: 'Compresses every escape square until your king crosses the horizon.',
    sayings: {
      win: 'Past the event horizon, nothing escapes.',
      loss: 'Radiation leaked out — well spotted.',
      draw: 'Time ran flat.',
      capture: 'Spaghettified.',
      collapse: 'Your army\'s information has fully radiated away.',
    },
    hue: 190,
    search: { timeMs: 14000, widths: [34, 20, 14, 12] },
    weights: {
      kingHunt: 0.38, soleKingAttacked: 5.8,
      soleKingCollapsedAttacked: 9.2,
      mobility: 0.022, hangUndefended: 0.98,
      mopUpEdge: 0.52, mopUpClose: 0.38,
    },
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
    weights: { kingHunt: 0.24, mobility: 0.018, center: 0.045 },
  },
  {
    id: 'vera-graf',
    name: 'Vera Graf',
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
    id: 'efim-faraday',
    name: 'Efim Faraday',
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
    search: { widths: [24, 14, 11] },
    weights: { kingHunt: 0.24, development: 0.075 },
  },
  {
    id: 'cecilia-chigorin',
    name: 'Cecilia Chigorin',
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
    search: { timeMs: 13500, widths: [26, 14, 12] },
    weights: { kingHunt: 0.26, hangUndefended: 0.8 },
  },
  {
    id: 'ernest-smyslov',
    name: 'Ernest Smyslov',
    rating: 2250,
    tier: 'hard',
    tagline: 'Your defense is mostly empty space — he fires straight through it.',
    sayings: {
      win: 'Straight through. As predicted.',
      loss: 'Sometimes the foil fires back.',
      draw: 'Scattered evenly.',
      capture: 'Direct hit on the nucleus.',
      collapse: 'All of your atoms are mapped.',
    },
    hue: 110,
    premium: true,
    search: { timeMs: 15000, widths: [28, 16, 12] },
    weights: { kingHunt: 0.26, soleKingAttacked: 5.5, mobility: 0.017, hangUndefended: 0.8 },
  },
];

// Source ledger for the parody names and portraits. Every historical person
// appears exactly once; scripts/audit-avatars.mjs enforces coverage and
// uniqueness so later roster edits cannot silently reuse an inspiration.
export const BOT_INSPIRATIONS = {
  'isaac-steinitz': { scientist: 'Isaac Newton', chess: 'Wilhelm Steinitz' },
  'emmy-menchik': { scientist: 'Emmy Noether', chess: 'Vera Menchik' },
  'galileo-greco': { scientist: 'Galileo Galilei', chess: 'Gioachino Greco' },
  'wolfgang-nimzowitsch': { scientist: 'Wolfgang Pauli', chess: 'Aron Nimzowitsch' },
  'boris-bohr': { scientist: 'Niels Bohr', chess: 'Boris Spassky' },
  'marie-lane': { scientist: 'Marie Curie', chess: 'Lisa Lane' },
  'enrico-capablanca': { scientist: 'Enrico Fermi', chess: 'José Raúl Capablanca' },
  'erwin-fischer': { scientist: 'Erwin Schrödinger', chess: 'Bobby Fischer' },
  'akiba-oppenheimer': { scientist: 'J. Robert Oppenheimer', chess: 'Akiba Rubinstein' },
  'werner-lasker': { scientist: 'Werner Heisenberg', chess: 'Emanuel Lasker' },
  'nikola-tal': { scientist: 'Nikola Tesla', chess: 'Mikhail Tal' },
  'rudolf-einstein': { scientist: 'Albert Einstein', chess: 'Rudolf Spielmann' },
  'freeman-morphy': { scientist: 'Freeman Dyson', chess: 'Paul Morphy' },
  'david-feynman': { scientist: 'Richard Feynman', chess: 'David Bronstein' },
  'edith-franklin': { scientist: 'Rosalind Franklin', chess: 'Edith Baird' },
  'savielly-dirac': { scientist: 'Paul Dirac', chess: 'Savielly Tartakower' },
  'james-euwe': { scientist: 'James Clerk Maxwell', chess: 'Max Euwe' },
  'stephen-reti': { scientist: 'Stephen Hawking', chess: 'Richard Réti' },
  'tigran-turing': { scientist: 'Alan Turing', chess: 'Tigran Petrosian' },
  'max-alekhine': { scientist: 'Max Planck', chess: 'Alexander Alekhine' },
  'vera-graf': { scientist: 'Vera Rubin', chess: 'Sonja Graf' },
  'efim-faraday': { scientist: 'Michael Faraday', chess: 'Efim Geller' },
  'cecilia-chigorin': { scientist: 'Cecilia Payne-Gaposchkin', chess: 'Mikhail Chigorin' },
  'ernest-smyslov': { scientist: 'Ernest Rutherford', chess: 'Vasily Smyslov' },
};

export const STARTER_BOT_ID = 'isaac-steinitz';
export const DEFAULT_BOT_ID = STARTER_BOT_ID;

export const BOT_ACCESS = Object.freeze({
  FREE: 'free',
  SUPPORTER: 'supporter',
  PREMIUM: 'premium',
});

const ACTIVE_BOT_IDS = new Set([
  'isaac-steinitz',
  'emmy-menchik',
  'galileo-greco',
  'wolfgang-nimzowitsch',
  'boris-bohr',
  'marie-lane',
  'enrico-capablanca',
  'erwin-fischer',
  'akiba-oppenheimer',
  'werner-lasker',
  'nikola-tal',
  'rudolf-einstein',
  'freeman-morphy',
  'david-feynman',
  'edith-franklin',
  'savielly-dirac',
  'james-euwe',
  'stephen-reti',
]);

export const ACTIVE_BOTS = BOTS.filter((bot) => ACTIVE_BOT_IDS.has(bot.id));
export const SHELVED_BOTS = BOTS.filter((bot) => !ACTIVE_BOT_IDS.has(bot.id));

export const BOT_AVATAR_BASE = '/bots';

export function getBotAvatarUrl(botOrId) {
  const id = typeof botOrId === 'string' ? botOrId : botOrId && botOrId.id;
  return id ? `${BOT_AVATAR_BASE}/${id}.png` : null;
}

export function botAccess(bot) {
  return (bot && bot.access) || BOT_ACCESS.FREE;
}

export function canAccessBot(bot, accountAccess = BOT_ACCESS.FREE) {
  const rank = { [BOT_ACCESS.FREE]: 0, [BOT_ACCESS.SUPPORTER]: 1, [BOT_ACCESS.PREMIUM]: 2 };
  return (rank[accountAccess] ?? 0) >= (rank[botAccess(bot)] ?? 0);
}

export function botAccessLabel(bot) {
  const access = botAccess(bot);
  if (access === BOT_ACCESS.SUPPORTER) return 'Supporter + Premium';
  if (access === BOT_ACCESS.PREMIUM) return 'Premium';
  return 'Free';
}

export const FREE_BOTS = ACTIVE_BOTS.filter((bot) => botAccess(bot) === BOT_ACCESS.FREE);
export const SUPPORTER_BOTS = ACTIVE_BOTS.filter((bot) => botAccess(bot) === BOT_ACCESS.SUPPORTER);
export const PREMIUM_BOTS = ACTIVE_BOTS.filter((bot) => botAccess(bot) === BOT_ACCESS.PREMIUM);

// Dev-only playtest override: open the app with ?allbots to make every active
// opponent pickable (progression + account gates skipped). Hard-dead
// in production builds, like the puzzle preview params.
export function devUnlockAllBots() {
  try {
    return Boolean(import.meta.env.DEV)
      && typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).has('allbots');
  } catch (_) {
    return false;
  }
}

export function getBotById(id) {
  return BOTS.find((b) => b.id === id) || null;
}

export function getActiveBotById(id) {
  return ACTIVE_BOTS.find((bot) => bot.id === id) || null;
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
