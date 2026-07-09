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
        interactive: {
          prompt: 'Move either of your pieces however you like — watch six possibilities shrink.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c2', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'f2', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'd7', types: 'pnbrqk' },
          ],
          goal: { kind: 'any' },
          success: 'One question part-answered. The piece keeps only the types that could have made that move — and that is true of every move you will ever make.',
        },
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
        interactive: {
          prompt: 'Slide the b1 piece two squares straight up — a pawn double-step from the back rank.',
          pieces: [
            { id: 'W1', side: 'white', square: 'b1', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'g2', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'b1', to: 'b3' },
          success: 'Pawn, Rook or Queen — a two-square first step from the BACK RANK might still be a pawn double-step. No square is privileged; the classical setup is just one world.',
        },
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
        interactive: {
          prompt: 'Hop your Knight to f3 to mark the e5 piece. Black will ignore the mark — watch e5’s gauge.',
          pieces: [
            { id: 'WN', side: 'white', square: 'd2', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e5', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'b7', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd2', to: 'f3' },
          autoReply: { from: 'b7', to: 'b6' },
          success: 'Black moved a DIFFERENT piece, so the marked e5 piece paid the deferred hit: one coherence pip gone. Moving e5 itself would have dodged the hit completely.',
        },
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
        interactive: {
          prompt: 'Slide your Bishop-Queen from b2 into the busy center at d4.',
          pieces: [
            { id: 'WB', side: 'white', square: 'b2', types: 'bq', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'b6', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'f6', types: 'pnbrqk' },
            { id: 'B3', side: 'black', square: 'f2', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'b2', to: 'd4' },
          success: 'One landing, three dashed rings: from d4 your piece could capture all three, so it soft-measured all three. But planted in the center, your instrument is now attackable itself.',
        },
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
        interactive: {
          prompt: 'Slide your Rook up to a5 — it will mark the c5 piece. Watch c5’s triangle gauge as Black replies.',
          pieces: [
            { id: 'WR', side: 'white', square: 'a1', types: 'r', moved: true },
            { id: 'W2', side: 'white', square: 'h1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'c5', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'g7', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'a1', to: 'a5' },
          autoReply: { from: 'g7', to: 'g6' },
          success: 'The mark landed at Black’s move: c5 dropped from three filled pips to two. Two more landed hits and it must shed an identity.',
        },
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
        interactive: {
          prompt: 'The d4 piece is down to ONE pip. Mark it with your Knight (d2 → b3) and watch the shed land.',
          pieces: [
            { id: 'WN', side: 'white', square: 'd2', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'd4', types: 'pnbrqk', pips: 1 },
            { id: 'B2', side: 'black', square: 'g7', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd2', to: 'b3' },
          autoReply: { from: 'g7', to: 'g6' },
          success: 'Zero coherence: it shed Pawn, its least valuable identity. Its cheap threats are gone, it is pricier to hang — and the fresh five-type identity starts a fresh full gauge.',
        },
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
        interactive: {
          prompt: 'This battered piece has one pip left. Let it escape its history: step it diagonally, c2 → d3.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c2', types: 'pnbrqk', pips: 1 },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'c2', to: 'd3' },
          success: 'Collapse is a fresh start: the new Bishop-Queen-King identity carries a brand-new full gauge. The damage belonged to the old identity, not to the piece.',
        },
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
          'The dots appear empty the moment it collapses — and every one of your moves after that fills one dot.',
        ],
        physics: "An unmonitored open system relaxes back toward superposition: recoherence. Each tick of the clock is amplitude rebuilding while the environment forgets its record.",
        interactive: {
          prompt: 'Your collapsed Knight on b3 wants its mystery back. Move your OTHER piece (d1 → d2) and watch the Knight’s clock.',
          pieces: [
            { id: 'WN', side: 'white', square: 'b3', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'd1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd1', to: 'd2' },
          success: 'Every one of your moves ticks the clock of every unwatched, nearly-defined piece you own: the Knight’s bottom row just went from zero to one.',
        },
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
        interactive: {
          prompt: 'The c3 piece sits at two of three dots. One more of your moves fills its clock: play a1 → a2.',
          pieces: [
            { id: 'WC', side: 'white', square: 'c3', types: 'nb', moved: true, regain: 2 },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'a1', to: 'a2' },
          success: 'The clock filled and the piece regained its least valuable feasible identity: maybe-Pawn is back, and your Knight-Bishop is a three-type mystery again.',
        },
        board: {
          files: 4,
          ranks: 4,
          pieces: [{ sq: 'b3', side: 'white', types: 'pn', regain: 0 }],
        },
      },
      {
        title: 'The Zeno lock',
        text: [
          'Any pulse that touches a nearly-defined piece freezes its recoherence back to zero. A watched piece never re-blurs.',
          'Keep your attackers trained on their collapsed pieces to lock them classical; slip your own out of sight to let them recover.',
        ],
        physics: "The quantum Zeno effect: sufficiently frequent observation freezes evolution. A watched wavefunction never re-spreads.",
        interactive: {
          prompt: 'Your b5 Knight’s clock is about to tick. Move d1 → d2 — and watch Black’s Rook slam the clock back to zero.',
          pieces: [
            { id: 'WN', side: 'white', square: 'b5', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'd1', types: 'pnbrqk' },
            { id: 'BR', side: 'black', square: 'h8', types: 'r', moved: true },
          ],
          goal: { kind: 'move', from: 'd1', to: 'd2' },
          autoReply: { from: 'h8', to: 'h5' },
          success: 'The Zeno lock: the Rook’s landing pulse touched your Knight and froze its recoherence back to zero. A watched piece never re-blurs.',
        },
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
        title: 'The solid line: sealed',
        text: [
          'Sometimes the census is complete: every identity a collapsed piece could regain is already confirmed elsewhere, or forbidden by its square. Its clock would tick forever and never deliver.',
          'The board replaces those dots with a SOLID LINE: the piece is sealed. What it is now is all it will ever be — no watching required.',
        ],
        physics: "When conservation laws leave no state for amplitude to flow back into, relaxation has no target: the reduced state is stationary. The environment cannot return what the bookkeeping forbids.",
        interactive: {
          prompt: 'Black’s c1 piece is Rook-or-Queen on its own promotion rank, with every Knight and Bishop confirmed. Make any move — its solid line never ticks.',
          pieces: [
            { id: 'BS', side: 'black', square: 'c1', types: 'rq', moved: true },
            { id: 'BN1', side: 'black', square: 'a1', types: 'n', moved: true },
            { id: 'BN2', side: 'black', square: 'e1', types: 'n', moved: true },
            { id: 'BB1', side: 'black', square: 'b1', types: 'b', moved: true },
            { id: 'BB2', side: 'black', square: 'd1', types: 'b', moved: true },
            { id: 'W1', side: 'white', square: 'b4', types: 'pnbrqk' },
          ],
          goal: { kind: 'any' },
          success: 'Sealed: Pawn is impossible on its promotion rank, both Knights and both Bishops are confirmed elsewhere, and it already holds Rook and Queen. The solid line says nothing is coming back.',
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
        interactive: {
          prompt: 'Step your f5 piece down-left onto e4 — straight into the collapsed Knight’s line of fire.',
          pieces: [
            { id: 'W1', side: 'white', square: 'f5', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'BN', side: 'black', square: 'd6', types: 'n', moved: true },
            { id: 'B2', side: 'black', square: 'h8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'f5', to: 'e4' },
          success: 'The step collapsed it to Bishop-Queen-King — then king pruning silently removed King, leaving exactly Bishop-or-Queen. You can never end your turn possibly-in-check on a threatened square.',
        },
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
          success: 'Castled! Both partners collapsed to Rook-or-King and met in the middle. Which is which stays an open question — conservation will settle it the moment the King is confirmed anywhere.',
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
        title: 'Two maybe-kings',
        text: [
          'Both pieces collapse to exactly Rook-or-King. No special bond ties them afterward — team conservation alone keeps the story straight: the moment ANY piece is confirmed as the King, every other piece loses King from its possibilities.',
          'And like any nearly-defined piece, a castled partner recoheres: its clock fills, and it can blur back toward superposition.',
        ],
        physics: "The castle is a projective measurement onto the rook-king subspace — nothing more. Which piece is which stays undetermined, and the environment is free to re-mix each partner's amplitudes over time.",
        interactive: {
          prompt: 'Resolve one partner: slide d1 up the board like a Rook (d1 → d5) and watch e1.',
          pieces: [
            { id: 'WA', side: 'white', square: 'd1', types: 'rk', moved: true, castled: true },
            { id: 'WB', side: 'white', square: 'e1', types: 'rk', moved: true, castled: true },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd1', to: 'd5' },
          success: 'Only a Rook slides four squares, so d1 IS the Rook. Its old partner keeps both faces — nothing snapped. Its recoherence clock is running, and if the KING is ever confirmed anywhere, every other piece sheds King on its own.',
        },
        board: {
          files: 8,
          ranks: 3,
          pieces: [
            { sq: 'd1', side: 'white', types: 'rk', regain: 0 },
            { sq: 'e1', side: 'white', types: 'rk', regain: 0 },
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
        interactive: {
          prompt: 'Open a window yourself: double-step your c2 piece to c4, right past Black’s d4 piece.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c2', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'd4', types: 'pnbrq' },
          ],
          goal: { kind: 'move', from: 'c2', to: 'c4' },
          success: 'Your piece kept Pawn among its possibilities, so for exactly one turn Black’s d4 piece may capture it on c3 — the square you passed through — as if you were a pawn.',
        },
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
        interactive: {
          prompt: 'Black just double-stepped b5 → b3, crossing b4. Capture it en passant: c3 → b4, into the EMPTY square.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c3', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'h1', types: 'pnbrqk' },
            { id: 'BV', side: 'black', square: 'b3', types: 'prq', moved: true },
            { id: 'B2', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          lastMove: { side: 'black', pieceId: 'BV', from: 'b5', to: 'b3', isDoubleStep: true, crossedSquare: 'b4' },
          goal: { kind: 'move', from: 'c3', to: 'b4', ep: true },
          success: 'A joint measurement: the passer collapsed to Pawn and died — and your capturer collapsed to exactly Pawn too. You bought certainty about them with certainty about yourself.',
        },
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
        interactive: {
          prompt: 'Your Pawn-or-Knight is one step from the end of the board. Push it: c7 → c8.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c7', types: 'pn', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'g5', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'c7', to: 'c8' },
          success: 'Only a pawn steps straight ahead, so it promoted: now Knight, Bishop, Rook or Queen, funded by one of your pawn slots — and wearing the ⟨…⟩ promotion braces. Pawn is gone forever.',
        },
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
          'A promoted piece wears bra-ket braces ⟨…⟩ around its dots — the mark of an identity funded by a pawn slot. Promotion fires once per piece, and recoherence never returns Pawn to it.',
          'Whether the promotion "really happened" stays entangled with your pawn pool: if your other pieces are later all confirmed as pawns, the promotion branch dies and the piece snaps back to its surviving identities.',
        ],
        physics: "The promotion branch remains entangled with the shared pawn pool. Confirm eight pawns elsewhere and the branch destructively interferes: the piece snaps back to its surviving amplitudes.",
        interactive: {
          prompt: 'This promoted Knight-or-Queen’s clock is at two dots. Move a1 → a2 to fill it — and see what does NOT come back.',
          pieces: [
            { id: 'WP', side: 'white', square: 'c4', types: 'nq', moved: true, promoted: true, regain: 2 },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'a1', to: 'a2' },
          success: 'It regained Bishop — skipping Pawn entirely. Recoherence never returns Pawn to a promoted piece: the braces are a permanent service stripe.',
        },
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
        interactive: {
          prompt: 'Finish it: slide your Rook to a8 and erase the last world where the Black King survives.',
          pieces: [
            { id: 'WR', side: 'white', square: 'a1', types: 'r', moved: true },
            { id: 'W2', side: 'white', square: 'c3', types: 'pnbrqk' },
            { id: 'BK', side: 'black', square: 'h8', types: 'k', moved: true },
            { id: 'BP1', side: 'black', square: 'g7', types: 'p', moved: true },
            { id: 'BP2', side: 'black', square: 'h7', types: 'p', moved: true },
          ],
          goal: { kind: 'move', from: 'a1', to: 'a8' },
          success: 'Checkmate. Every legal Black reply still leaves the King capturable — the survival amplitude is zero in every world. The classic back-rank mate works here too.',
        },
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
        physics: "Positions repeat only if their full quantum states are identical — possibility sets, coherence, clocks and all. Equality of the classical shadow is not equality of the state.",
        interactive: {
          prompt: 'Last exercise. Make any move at all — then go play a real game.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c2', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'f2', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'd6', types: 'pnbrqk' },
          ],
          goal: { kind: 'any' },
          success: 'That collapse counted as progress — information gained resets the fifty-move draw clock, so active quantum play never runs it down. Class dismissed: your pieces await their identities.',
        },
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
