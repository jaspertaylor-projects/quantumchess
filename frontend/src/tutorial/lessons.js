// frontend/src/tutorial/lessons.js
// Purpose: The tutorial curriculum — ordered lessons of illustrated steps.
// Each lesson points at its rulebook section (by page title) so the player
// can jump between playing a lesson and reading the fine print.
// Imports From: None
// Exported To: ./TutorialModal.jsx, ../tray/RulesModal.jsx

export const LESSONS = [
  {
    id: 'big-idea',
    title: 'The Big Idea',
    blurb: 'Every piece is every piece — until it moves.',
    rulesPage: 'Quantum Pieces & Superposition',
    steps: [
      {
        title: 'Thirty-two unresolved questions',
        text: [
          'This is not a chess set — it is 32 unresolved questions. Every piece begins as a superposition of Pawn, Knight, Bishop, Rook, Queen AND King.',
          'Nobody knows which piece is your King yet. Not your opponent. Not you.',
        ],
        physics: "Each piece is a quantum system whose type is an observable that has never been measured. Its state is a uniform superposition over the type basis: |ψ⟩ = |P⟩ + |N⟩ + |B⟩ + |R⟩ + |Q⟩ + |K⟩.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [
            { sq: 'b2', side: 'white', types: 'pnbrqk', pips: 3 },
            { sq: 'c3', side: 'black', types: 'pnbrqk', pips: 3 },
          ],
        },
      },
      {
        title: 'Moving is answering',
        text: [
          'A piece may move like ANY type it might still be. But the move itself is evidence: after moving, it keeps only the types that could have made that move.',
          'This piece just jumped like a knight. Nothing else jumps — so now it IS a Knight. One question answered, forever.',
        ],
        physics: "A move is a projective measurement of the displacement operator. The state collapses onto the eigenspace consistent with the observed motion — a knight-jump projects onto a single eigenstate, |N⟩.",
        interactive: {
          prompt: 'Your turn: click the white piece on b1, then click c3 — a knight jump.',
          pieces: [
            { id: 'W1', side: 'white', square: 'b1', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'g1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'b1', to: 'c3' },
          success: 'Collapse! Only a Knight jumps like that, so six possibilities just became one. That piece is a Knight now — forever.',
        },
        board: {
          files: 5,
          ranks: 5,
          pieces: [{ sq: 'c3', side: 'white', types: 'n' }],
          arrows: [{ from: 'b1', to: 'c3', side: 'white' }],
          highlights: ['b1'],
        },
      },
      {
        title: 'Partial answers',
        text: [
          'Most moves only narrow the question. A long diagonal slide could be a Bishop or a Queen — so the piece becomes exactly that pair, and nothing else.',
          'Choosing HOW to move is choosing how much of your identity to spend.',
        ],
        physics: "Most displacements are degenerate: a diagonal slide projects onto the two-dimensional subspace span{|B⟩, |Q⟩}. Partial measurement, partial collapse.",
        interactive: {
          prompt: 'Slide the c1 piece all the way to g5 — a long diagonal.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c1', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'c1', to: 'g5' },
          success: 'A partial collapse: Bishop and Queen both slide diagonally, so the piece is now exactly that pair — and nothing else. Note its fresh empty recoherence dots.',
        },
        board: {
          files: 5,
          ranks: 5,
          pieces: [{ sq: 'e5', side: 'white', types: 'bq' }],
          arrows: [{ from: 'b2', to: 'e5', side: 'white' }],
          highlights: ['b2'],
        },
      },
      {
        title: 'Normal chess is just one arrangement',
        text: [
          'No rule here privileges the standard setup. A pawn can live on the back rank. Any first move of two squares straight ahead might be a pawn double-step — from anywhere.',
          'The classical game is just one of the worlds this game can collapse into.',
        ],
        physics: "The classical starting position is just one basis state of the game's Hilbert space. The dynamics are basis-independent — no arrangement is privileged.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [
            { sq: 'b1', side: 'white', types: 'prqk' },
            { sq: 'd2', side: 'white', types: 'pnbrqk', pips: 3 },
          ],
          arrows: [{ from: 'd2', to: 'd4', side: 'white' }],
        },
      },
    ],
  },
  {
    id: 'pulses',
    title: 'Moving Is Observing',
    blurb: 'Every move soft-measures everything it could capture.',
    rulesPage: 'Measurement Pulses',
    steps: [
      {
        title: 'The measurement pulse',
        text: [
          'When your piece finishes a move, it performs a soft measurement on every enemy piece it could capture from its new square — using any of its remaining types.',
          'This knight just landed on d4. Dashed rings mark everything its pulse touched. To observe, you must be able to touch.',
        ],
        physics: "Landing a piece couples it to every enemy system inside its interaction range — capture reach is the coupling term. Each touched piece undergoes a weak (soft) measurement.",
        interactive: {
          prompt: 'Hop your Knight from d2 to f3 and watch the pulse land.',
          pieces: [
            { id: 'WN', side: 'white', square: 'd2', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e5', types: 'pnbrq' },
            { id: 'B2', side: 'black', square: 'g5', types: 'pnbrq' },
            { id: 'B3', side: 'black', square: 'h8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd2', to: 'f3' },
          success: 'Your landing soft-measured both pieces it could capture — the dashed rings. They are marked: each loses one coherence pip at Black’s next move, unless it moves itself and dodges.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'd4', side: 'white', types: 'n' },
            { sq: 'c6', side: 'black', types: 'pnbrqk', pips: 3, mark: true },
            { sq: 'e6', side: 'black', types: 'pnbrqk', pips: 3, mark: true },
            { sq: 'f5', side: 'black', types: 'pnbrqk', pips: 3, mark: true },
          ],
        },
      },
      {
        title: 'Marks, not instant damage',
        text: [
          'A pulsed piece is MARKED, not hurt. The damage lands at its owner\'s next move: the marked piece loses one point from its triangle gauge.',
          'Unless the owner moves that very piece — that dodges the hit completely and resets it. A threatened piece is a piece being told to move.',
        ],
        physics: "A weak measurement does not collapse the state; it entangles it with the environment. The mark is a pending readout — moving the marked piece is unitary evasion before the record becomes permanent.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [{ sq: 'c3', side: 'black', types: 'pnbrqk', pips: 2 }],
        },
      },
      {
        title: 'Risk buys information',
        text: [
          'The pulse is as wide as your reach: a piece planted in a busy center measures several enemies at once, while a quiet retreat measures nothing.',
          'But standing in capture-contact means your instrument is itself attackable. Passivity earns no information; aggression is how you learn.',
        ],
        physics: "Information gain is bounded by coupling strength: to extract which-type information you must interact, and interaction exposes the probe to back-action.",
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'd4', side: 'white', types: 'bq' },
            { sq: 'b6', side: 'black', types: 'pnbrqk', pips: 3, mark: true },
            { sq: 'f6', side: 'black', types: 'pnbrqk', pips: 3, mark: true },
            { sq: 'f2', side: 'black', types: 'pnbrqk', pips: 3, mark: true },
          ],
        },
      },
    ],
  },
  {
    id: 'decoherence',
    title: 'The Triangle Gauge',
    blurb: 'Three points of coherence, then something is lost.',
    rulesPage: 'Measurement Pulses',
    steps: [
      {
        title: 'Coherence',
        text: [
          'Every superposed piece carries 3 coherence points — the triangle in its center, drawn in the enemy\'s color. Filled dots are what remains.',
          'Each landed measurement hit removes one.',
        ],
        physics: "Coherence measures how much superposition survives environmental monitoring. Each landed readout removes one quantum of coherence from the system.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [
            { sq: 'b3', side: 'black', types: 'pnbrqk', pips: 3 },
            { sq: 'c2', side: 'black', types: 'pnbrqk', pips: 1 },
          ],
        },
      },
      {
        title: 'The shed: lose cheap',
        text: [
          'At zero coherence the piece sheds its LEAST valuable remaining possibility — Pawn first, then Knight, Bishop, Rook, Queen. King is never shed.',
          'Losing your cheap identities is real pain: the piece becomes expensive to hang and loses its cheap capture threats. Gain cheap, lose cheap — the mirror of recoherence.',
        ],
        physics: "At zero coherence the environment traces out the lightest branch: the lowest-value amplitude decoheres away, and the reduced state loses one dimension.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [{ sq: 'b3', side: 'black', types: 'nbrqk', pips: 3 }],
        },
      },
      {
        title: 'Collapse is a fresh start',
        text: [
          'Whenever a piece\'s possibilities shrink — by moving, shedding, or the global solver pruning it from afar — its gauge resets to full. A new identity starts a new clock.',
          'Soft measurement can never fully define a piece. Only its own moves, captures, and check pruning finish the job.',
        ],
        physics: "Every collapse prepares a fresh pure state. Accumulated decoherence is not a property the new state inherits — the clock belongs to the identity, not the piece.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [{ sq: 'c3', side: 'white', types: 'rq', regain: 0 }],
        },
      },
    ],
  },
  {
    id: 'recoherence',
    title: 'Growing Back',
    blurb: 'Unwatched pieces re-blur into superposition.',
    rulesPage: 'Measurement Pulses',
    steps: [
      {
        title: 'The bottom dots',
        text: [
          'A piece with two or fewer possibilities starts diffusing back toward superposition. Its clock is the row of dots beneath it, in its own side\'s color.',
          'The dots appear empty the moment it collapses — and the clock only starts after the piece sits one full turn at zero.',
        ],
        physics: "An unmonitored open system relaxes back toward superposition: recoherence. The empty clock is the relaxation delay before amplitude begins to rebuild.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [
            { sq: 'b3', side: 'white', types: 'n', regain: 0 },
            { sq: 'c2', side: 'white', types: 'nb', regain: 2 },
          ],
        },
      },
      {
        title: 'Regain cheap',
        text: [
          'At three dots the piece regains its least valuable FEASIBLE possibility — never King, never a Pawn on promoted pieces or the promotion rank, never anything conservation has ruled out.',
          'Your collapsed knight can become a maybe-pawn again. Mystery is a resource that regrows — if you protect it.',
        ],
        physics: "The regained amplitude is the cheapest branch permitted by the selection rules — global conservation forbids King, and forbidden Pawn states stay forbidden.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [{ sq: 'b3', side: 'white', types: 'pn', regain: 0 }],
        },
      },
      {
        title: 'The Zeno lock',
        text: [
          'Any pulse that touches a nearly-defined piece freezes its recoherence back to zero — including the fresh grace turn. A watched piece never re-blurs.',
          'Keep your attackers trained on their collapsed pieces to lock them classical; slip your own out of sight to let them recover.',
        ],
        physics: "The quantum Zeno effect: sufficiently frequent observation freezes evolution. A watched wavefunction never re-spreads.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [
            { sq: 'e4', side: 'black', types: 'r' },
            { sq: 'b4', side: 'white', types: 'n', regain: 0, mark: true },
          ],
          arrows: [{ from: 'e4', to: 'b4', side: 'black' }],
        },
      },
      {
        title: 'The chain link',
        text: [
          'Entangled castle partners never recohere — their identities stay bound to each other. Instead of a clock that would never fill, they wear a chain link.',
        ],
        physics: "A maximally entangled pair carries all of its uncertainty in the correlation. There is no free entropy left for either partner to re-superpose independently.",
        board: {
          files: 4,
          ranks: 2,
          pieces: [
            { sq: 'b1', side: 'white', types: 'rk', chain: true },
            { sq: 'c1', side: 'white', types: 'rk', chain: true },
          ],
        },
      },
    ],
  },
  {
    id: 'check',
    title: 'Check, Quantum Style',
    blurb: 'Only nearly-defined pieces project real threats.',
    rulesPage: 'Checks and Threats',
    steps: [
      {
        title: 'Who can give check',
        text: [
          'A piece starts checking once it has two or fewer possibilities. A six-type blur "could" be a rook — but that is too uncertain to be a threat. A collapsed rook IS one.',
          'When a check is live, an arrow in the attacker\'s color runs from the checker to the checked piece, and the target wears a pulsing red ring.',
        ],
        physics: "Threat is which-type information. A six-type state has near-maximal entropy — too little certainty to act on. A two-type state is nearly pure: its attack operators have definite support.",
        interactive: {
          prompt: 'Slide your collapsed Rook from a1 to e1, onto the open e-file.',
          pieces: [
            { id: 'WR', side: 'white', square: 'a1', types: 'r', moved: true },
            { id: 'W2', side: 'white', square: 'h2', types: 'pnbrqk' },
            { id: 'BK', side: 'black', square: 'e8', types: 'k', moved: true },
            { id: 'B2', side: 'black', square: 'b8', types: 'pnbrq' },
          ],
          goal: { kind: 'move', from: 'a1', to: 'e1' },
          success: 'Check! A nearly-defined piece projects real threats: the arrow runs from your Rook up the file to the Black King, which wears the pulsing red ring.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'e5', side: 'black', types: 'rq' },
            { sq: 'e1', side: 'white', types: 'k', ring: true },
          ],
          arrows: [{ from: 'e5', to: 'e1', side: 'black' }],
        },
      },
      {
        title: 'King pruning',
        text: [
          'After your move resolves, any of your pieces left standing on threatened squares silently lose King from their possibilities — you can never end your turn possibly-in-check.',
          'So a red ring means pruning had nowhere to hide: a definite King, or your very last King-holder, is genuinely under fire. Deal with it.',
        ],
        physics: "King pruning is postselection: after each move, branches in which your King stands inside enemy capture support are projected out of your side's wavefunction.",
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'd6', side: 'black', types: 'n' },
            { sq: 'e4', side: 'white', types: 'nbrq' },
            { sq: 'c4', side: 'white', types: 'pnbrqk', pips: 3 },
          ],
          arrows: [{ from: 'd6', to: 'e4', side: 'black' }],
        },
      },
    ],
  },
  {
    id: 'castling',
    title: 'Castling & Entanglement',
    blurb: 'Any two unmoved pieces that might be Rook and King.',
    rulesPage: 'Castling (Rook–King Pairing)',
    steps: [
      {
        title: 'Anyone can castle',
        text: [
          'Castling works between ANY two of your unmoved pieces whose possibilities still include both Rook and King — on any rank, with a clear path between them. Normal chess is just one arrangement.',
          'Drag one onto the other. They slide toward each other and meet in the middle. Once per game.',
        ],
        physics: "Castling is a joint measurement of two systems onto the {|R⟩, |K⟩} subspace — performed on any pair whose amplitudes still overlap it.",
        interactive: {
          prompt: 'Castle: click one of your unmoved pieces, then click the other.',
          pieces: [
            { id: 'WB', side: 'white', square: 'b1', types: 'pnbrqk' },
            { id: 'WG', side: 'white', square: 'g1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'h8', types: 'pnbrqk' },
          ],
          goal: { kind: 'castle' },
          success: 'Entangled! Both partners collapsed to Rook-or-King and met in the middle, wearing the chain link. In every world exactly one is the King — resolve either, and the other snaps to the complement instantly.',
        },
        board: {
          files: 8,
          ranks: 3,
          pieces: [
            { sq: 'b1', side: 'white', types: 'pnbrqk', pips: 3 },
            { sq: 'g1', side: 'white', types: 'pnbrqk', pips: 3 },
          ],
          highlights: ['d1', 'e1'],
        },
      },
      {
        title: 'The entangled pair',
        text: [
          'Both pieces collapse to exactly Rook-or-King — and become anti-correlated: in every consistent world, one is the King and the other is the Rook.',
          'The moment either partner resolves, the other instantly snaps to the complementary type. Until then they wear the chain link, bound and unrecoverable.',
        ],
        physics: "The pair leaves in the anti-correlated Bell state (|K⟩|R⟩ + |R⟩|K⟩)/√2. Measuring either partner instantly determines the other, at any distance across the board.",
        board: {
          files: 8,
          ranks: 3,
          pieces: [
            { sq: 'd1', side: 'white', types: 'rk', chain: true },
            { sq: 'e1', side: 'white', types: 'rk', chain: true },
          ],
        },
      },
    ],
  },
  {
    id: 'enpassant',
    title: 'The Phantom Capture',
    blurb: 'En passant is a measurement you choose to make.',
    rulesPage: 'En Passant (Phantom Capture)',
    steps: [
      {
        title: 'The window opens',
        text: [
          'An enemy piece makes a two-square first move while Pawn is still among its possibilities — from any rank. For exactly one turn, it can be captured as if it were a pawn passing through.',
        ],
        physics: "The double-step leaves transient amplitude on the crossed square — a one-turn interference window before it decays.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [
            { sq: 'b4', side: 'black', types: 'prqk' },
            { sq: 'c4', side: 'white', types: 'pnbrqk', pips: 3 },
          ],
          arrows: [{ from: 'b2', to: 'b4', side: 'black' }],
          highlights: ['b3'],
        },
      },
      {
        title: 'The measurement cuts both ways',
        text: [
          'Your adjacent pawn-possible piece steps diagonally into the crossed square — the EMPTY one — and the passer is removed.',
          'You assert a world where both pieces were pawns: the victim collapses to Pawn and dies; your capturer collapses to exactly Pawn too. Information is never free.',
        ],
        physics: "En passant is a joint projective measurement onto |P⟩ ⊗ |P⟩: one act collapses both systems into the pawn-world. Information about the opponent costs information about yourself.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [{ sq: 'b3', side: 'white', types: 'p' }],
          arrows: [{ from: 'c4', to: 'b3', side: 'white' }],
          highlights: ['b4'],
        },
      },
    ],
  },
  {
    id: 'promotion',
    title: 'Quantum Promotion',
    blurb: 'A branch, not an assertion.',
    rulesPage: 'Quantum Promotion',
    steps: [
      {
        title: 'The branch',
        text: [
          'When a piece that might still be a Pawn reaches the far rank, it promotes — in the worlds where it WAS a pawn. There it becomes Knight, Bishop, Rook or Queen, funded by one of your eight pawn slots.',
          'In the worlds where it was never a pawn, nothing happened: it keeps its other identities. The piece carries both branches at once.',
        ],
        physics: "Promotion is unitary branching, not collapse: the Pawn amplitude rotates into the heavy-piece sector, funded by a pawn slot, while every non-Pawn amplitude passes through untouched.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [{ sq: 'c5', side: 'white', types: 'nbrq', chevrons: true }],
          arrows: [{ from: 'b4', to: 'c5', side: 'white' }],
        },
      },
      {
        title: 'The service stripe',
        text: [
          'A promoted piece wears chevrons top-center — exactly where Pawn would be drawn, the one identity it can never hold again. Promotion fires once per piece, and recoherence never returns Pawn to it.',
          'Whether the promotion "really happened" stays entangled with your pawn pool: if your other pieces are later all confirmed as pawns, the promotion branch dies and the piece snaps back to its surviving identities.',
        ],
        physics: "The promotion branch remains entangled with the shared pawn pool. Confirm eight pawns elsewhere and the branch destructively interferes: the piece snaps back to its surviving amplitudes.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [{ sq: 'b4', side: 'white', types: 'nq', chevrons: true, regain: 1 }],
        },
      },
    ],
  },
  {
    id: 'endgame',
    title: 'Winning and Drawing',
    blurb: 'Kill every world where their King survives.',
    rulesPage: 'Checkmate',
    steps: [
      {
        title: 'Checkmate',
        text: [
          'You win when, after your move resolves, every legal reply leaves your opponent either with NO piece that could still be the King — or with a single known King you can capture next move no matter what.',
          'You are not hunting a piece; you are exterminating the possibility of a surviving King across all worlds.',
        ],
        physics: "Checkmate is the vanishing of survival amplitude: over every branch of the opponent's reply superposition, ⟨King survives|ψ⟩ = 0.",
        board: {
          files: 5,
          ranks: 5,
          pieces: [
            { sq: 'd5', side: 'black', types: 'k', ring: true },
            { sq: 'b5', side: 'white', types: 'r' },
            { sq: 'c3', side: 'white', types: 'q' },
          ],
          arrows: [
            { from: 'b5', to: 'd5', side: 'white' },
            { from: 'c3', to: 'd4', side: 'white' },
          ],
        },
      },
      {
        title: 'Draws',
        text: [
          'Stalemate: no legal move and not in check — drawn. Fifty quiet moves with no capture, no definite pawn move, no promotion, and no information gained — drawn. The same FULL quantum state three times — drawn.',
          'Collapsing superpositions counts as progress, so active quantum play never runs the clock down. Now go play. Your pieces do not know who they are — teach them the hard way.',
        ],
        physics: "Positions repeat only if their full quantum states are identical — possibility sets, coherence, entanglement and all. Equality of the classical shadow is not equality of the state.",
        board: {
          files: 4,
          ranks: 4,
          pieces: [
            { sq: 'b2', side: 'white', types: 'pnbrqk', pips: 3 },
            { sq: 'c3', side: 'black', types: 'pnbrqk', pips: 3 },
          ],
        },
      },
    ],
  },
];

export function getLessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}
