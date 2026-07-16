// frontend/src/tutorial/lessons.js
// Purpose: The tutorial curriculum — ordered lessons of illustrated steps.
// Each lesson points at its rulebook section (by page title) so the player
// can jump between playing a lesson and reading the fine print. Every
// interactive exercise runs on the REAL engine, so zaps, heals, shields,
// the census, and the win conditions behave exactly as in a live game
// (positions verified by tests/tutorial-exercises-verify.mjs).
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
            { sq: 'b2', side: 'white', types: 'pnbrqk' },
            { sq: 'c3', side: 'black', types: 'pnbrqk' },
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
          success: 'A partial collapse: Bishop and Queen both slide diagonally, so the piece is now exactly that pair — and nothing else.',
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
            { sq: 'd2', side: 'white', types: 'pnbrqk' },
          ],
          arrows: [{ from: 'd2', to: 'd4', side: 'white' }],
        },
      },
    ],
  },
  {
    id: 'the-zap',
    title: 'The Zap',
    blurb: 'Everything you touch loses its best self.',
    rulesPage: 'The Zap',
    steps: [
      {
        title: 'Touch is a zap',
        text: [
          'When your piece finishes a move, it TOUCHES every square it could capture on. Every enemy piece it touches is ZAPPED: it loses the most valuable possibility it can cleanly give up — King first, then Queen, and on down.',
          'A red ring marks each zap. Attack a fresh superposition and its maybe-King is usually the first thing to die.',
        ],
        physics: "Landing a piece couples it to every system in its interaction range. For enemy systems the coupling is dissipative: the highest-value amplitude that can decay without disturbing the rest of the board is projected out.",
        interactive: {
          prompt: 'Hop your Knight from d2 to f3 — its landing touches the black piece on e5.',
          pieces: [
            { id: 'WN', side: 'white', square: 'd2', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e5', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'h8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd2', to: 'f3' },
          success: 'Zap! Your knight touches e5, and e5 loses the best thing it could have been — its King possibility is gone. Five identities left, and none of them royal.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'd4', side: 'white', types: 'n' },
            { sq: 'c6', side: 'black', types: 'pnbrq', zap: true },
            { sq: 'e6', side: 'black', types: 'pnbrq', zap: true },
          ],
        },
      },
      {
        title: 'The zap walks down',
        text: [
          'A zap tries to remove King, then Queen, then Rook, Bishop, Knight, Pawn — and takes the FIRST one it can remove cleanly, without forcing any other piece on the board to change.',
          'A piece that is fully known (one possibility) has nothing left to lose: zaps pass through it.',
        ],
        physics: "The zap is a guarded projection: it scans the value ladder top-down and removes the first amplitude whose loss leaves every other system's state invariant. A pure state has no amplitude to shed.",
        interactive: {
          prompt: 'Zap a wounded piece: hop d2 → f3 and touch the Rook-or-Queen on e5.',
          pieces: [
            { id: 'WN', side: 'white', square: 'd2', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e5', types: 'rq', moved: true },
            { id: 'B2', side: 'black', square: 'h8', types: 'pnbrqk' },
            { id: 'B3', side: 'black', square: 'a8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd2', to: 'f3' },
          success: 'It had no King to lose, so the zap walked down the ladder and took the Queen. What is left on e5 is exactly a Rook — you measured it into a lesser piece.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'f3', side: 'white', types: 'n' },
            { sq: 'e5', side: 'black', types: 'r', zap: true },
          ],
          arrows: [{ from: 'f3', to: 'e5', side: 'white' }],
        },
      },
      {
        title: 'You touch as your cheapest self',
        text: [
          'Your reach comes from the CHEAPEST thing you might still be. A fresh six-type blur pokes like a pawn. Collapse it to a bishop pair and it sweeps whole diagonals.',
          'Collapsing your own pieces is what arms them. Identity is ammunition.',
        ],
        physics: "The interaction range is set by the lowest-value amplitude in the mover's state — the cheapest identity dominates the coupling. Purifying the state upward extends its reach.",
        interactive: {
          prompt: 'Slide c1 → g5, a long diagonal. Your piece becomes Bishop-or-Queen — and touches as a bishop.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c1', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'e7', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'b8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'c1', to: 'g5' },
          success: 'Your Bishop-or-Queen touches along BISHOP lines — the cheapest self it still holds — and its ray zapped e7 from across the board. That piece can no longer be the king.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'c2', side: 'white', types: 'prq' },
            { sq: 'd3', side: 'black', types: 'pnbrq' },
            { sq: 'f5', side: 'white', types: 'bq' },
            { sq: 'd5', side: 'black', types: 'pnbrq', zap: true },
          ],
          arrows: [{ from: 'f5', to: 'd5', side: 'white' }],
        },
      },
    ],
  },
  {
    id: 'the-heal',
    title: 'The Heal',
    blurb: 'Protect a piece and it grows back.',
    rulesPage: 'The Heal',
    steps: [
      {
        title: 'Protection regrows possibility',
        text: [
          'The same touch that zaps enemies HEALS friends. Every friendly piece your move touches regains its cheapest missing identity — Pawn first, then Knight, Bishop, Rook, Queen, and finally King.',
          'One royal exception: if your team has no King possibility, Heal restores King first. A green ring marks each heal. Defended pieces do not just survive here — they recover.',
        ],
        physics: "For friendly systems the contact coupling is restorative: the lowest-value amplitude missing from the state is re-populated, provided global conservation admits it.",
        interactive: {
          prompt: 'Your e4 piece was zapped down to Pawn-or-Rook. Protect it: jump b1 → c3.',
          pieces: [
            { id: 'W1', side: 'white', square: 'e4', types: 'pr', moved: true },
            { id: 'W2', side: 'white', square: 'b1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'h8', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'a8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'b1', to: 'c3' },
          success: 'Healed! Your knight jump removed White’s last King possibility, so the friendly piece on e4 received the royal-priority Heal. It can be King again. Keep protecting wounded pieces and they keep growing.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'c3', side: 'white', types: 'n' },
            { sq: 'e4', side: 'white', types: 'prk', heal: true },
          ],
          arrows: [{ from: 'c3', to: 'e4', side: 'white' }],
        },
      },
      {
        title: 'Heals obey the ledger',
        text: [
          'A heal can only return an identity the conservation ledger allows. If your team has no King possibility, Heal tries King FIRST and may reveal the healed piece as King immediately. Otherwise King stays at the end of the ladder. Pawn never returns to a promoted piece, or to any piece standing on its promotion rank.',
          'And if an identity is fully claimed elsewhere — say both your knights are known — the heal skips it and gives the next one up the ladder.',
        ],
        physics: "Recovery is constrained repopulation: an amplitude returns only if a consistent global assignment exists. Fully-claimed sectors are skipped in value order, with the royal amplitude available as the final rung.",
        interactive: {
          prompt: 'Both black knights are pinned down on this board. Heal your bare pawn anyway: d2 → d3 touches e4.',
          pieces: [
            { id: 'W1', side: 'white', square: 'e4', types: 'p', moved: true },
            { id: 'W2', side: 'white', square: 'd2', types: 'pbrqk' },
            { id: 'WN1', side: 'white', square: 'c3', types: 'n', moved: true },
            { id: 'WN2', side: 'white', square: 'g1', types: 'n', moved: true },
            { id: 'B1', side: 'black', square: 'h8', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'a8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd2', to: 'd3' },
          success: 'The heal wanted to return Knight — but both your knights are already claimed, so it OVERFLOWED to the next rung: your pawn is now a Pawn-Bishop. The census bends every heal around it.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'd3', side: 'white', types: 'prqk' },
            { sq: 'e4', side: 'white', types: 'pb', heal: true },
            { sq: 'c3', side: 'white', types: 'n' },
            { sq: 'f1', side: 'white', types: 'n' },
          ],
        },
      },
    ],
  },
  {
    id: 'captures',
    title: 'Capturing & Being Captured',
    blurb: 'A taken piece resolves as the least it could be.',
    rulesPage: 'Captures',
    steps: [
      {
        title: 'The pessimistic collapse',
        text: [
          'When a piece is captured, it collapses to the LEAST valuable thing it could still be — and dies as that. Capture a fresh superposition and you usually just killed a pawn.',
          'This is why zaps matter: strip a piece down FIRST, and it has to die as something expensive.',
        ],
        physics: "Capture is a destructive measurement resolved pessimistically for the owner: the annihilated system collapses to its minimum-value eigenstate. Pre-measurement raises the floor.",
        interactive: {
          prompt: 'This black piece is Knight, Bishop or Queen — its pawn worlds are gone. Take it: a1 → a8.',
          pieces: [
            { id: 'WR', side: 'white', square: 'a1', types: 'r', moved: true },
            { id: 'W2', side: 'white', square: 'h1', types: 'pnbrqk' },
            { id: 'BV', side: 'black', square: 'a8', types: 'nbq', moved: true },
            { id: 'B2', side: 'black', square: 'd8', types: 'pnbrqk' },
            { id: 'B3', side: 'black', square: 'h8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'a1', to: 'a8' },
          success: 'Captured — and it resolved as the least it could be: a Knight, because its cheaper selves were already gone. Notice your rook’s landing also zapped the next piece down the rank.',
        },
        board: {
          files: 5,
          ranks: 5,
          pieces: [
            { sq: 'c4', side: 'white', types: 'r' },
            { sq: 'e4', side: 'black', types: 'nbq' },
          ],
          arrows: [{ from: 'c4', to: 'e4', side: 'white' }],
        },
      },
      {
        title: 'The royal safeguard',
        text: [
          'There is no check for a superposed king — a maybe-King is just a possibility, and possibilities cannot be threatened, only zapped away.',
          'Zap may remove King while another maybe-King remains, but it can never erase the final royal possibility. If a volley would do that, it zaps the next most valuable possibility on every affected piece instead.',
        ],
        physics: "Royal amplitude can move and recover, but the contact operator preserves at least one royal branch. Only a revealed King can be checkmated.",
      },
    ],
  },
  {
    id: 'the-census',
    title: 'The Census',
    blurb: 'One army, one ledger — claims strip everyone else.',
    rulesPage: 'The Census (Conservation)',
    steps: [
      {
        title: 'Claims propagate',
        text: [
          'Your side owns exactly 8 pawns, 2 knights, 2 bishops, 2 rooks, 1 queen, 1 king — across all worlds. The moment two of your pieces are KNOWN knights, no other piece of yours can be one: the census strips Knight from all of them, instantly.',
          'Watch your opponent’s definite pieces: every one of them quietly rewrites the rest of their army.',
        ],
        physics: "The army is one entangled state with fixed occupation numbers per type sector. Confirming occupancy in a sector projects that sector out of every other subsystem — conservation does the bookkeeping.",
        interactive: {
          prompt: 'One knight is known. Claim the second: jump g1 → f3 and watch e4 and a1.',
          pieces: [
            { id: 'WN1', side: 'white', square: 'c3', types: 'n', moved: true },
            { id: 'W1', side: 'white', square: 'g1', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'e4', types: 'npr', moved: true },
            { id: 'W3', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'h8', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'a8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'g1', to: 'f3' },
          success: 'Your second knight is claimed — and the census swept the board: e4 and a1 both lost their Knight possibility in the same instant. One ledger, one army.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'b2', side: 'white', types: 'n' },
            { sq: 'e2', side: 'white', types: 'n' },
            { sq: 'd5', side: 'white', types: 'pbrqk' },
          ],
        },
      },
      {
        title: 'The ledger giveth back',
        text: [
          'The census runs both ways. Captured pieces sit in the bins as DEFINITE types — they pin the ledger from the outside. And when a claim is released (a known knight dies), Knight can flow back into heals again.',
          'Reading both bins tells you what your opponent’s blurs can still secretly be.',
        ],
        physics: "The bins are the environment's classical record: each captured piece is a completed measurement that permanently constrains the remaining entangled state. The reachable state space shrinks with every entry.",
      },
    ],
  },
  {
    id: 'the-shield',
    title: 'The Shield',
    blurb: 'Some pieces cannot be zapped — yet.',
    rulesPage: 'Shields',
    steps: [
      {
        title: 'Census-locked',
        text: [
          'Sometimes a zap finds NOTHING it can remove cleanly — every possibility the target holds is load-bearing, and removing any of them would force other pieces to change. The zap fizzles against a shield.',
          'A gold ring marks the shield. These pieces are locked into a closed group: N pieces sharing exactly N identities. Break the group — capture one, or force a collapse — and the shield drops.',
        ],
        physics: "A maximally-entangled closed subgroup admits no local projection: removing any amplitude from one member forces a global rearrangement. The guarded zap refuses non-local action and dissipates instead.",
        interactive: {
          prompt: 'Black’s three survivors share exactly three identities. Push e3 → e4 and try to zap d5.',
          pieces: [
            { id: 'WP', side: 'white', square: 'e3', types: 'p', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'BA', side: 'black', square: 'e8', types: 'qk', moved: true },
            { id: 'BB', side: 'black', square: 'd5', types: 'rk', moved: true },
            { id: 'BC', side: 'black', square: 'a8', types: 'rq', moved: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'p', captured: true },
            { side: 'black', types: 'n', captured: true },
            { side: 'black', types: 'n', captured: true },
            { side: 'black', types: 'b', captured: true },
            { side: 'black', types: 'b', captured: true },
            { side: 'black', types: 'r', captured: true },
          ],
          goal: { kind: 'move', from: 'e3', to: 'e4' },
          success: 'SHIELDED. Removing King from d5 would force e8 to be THE king; removing Rook would collapse d5 outright and rearrange the rest. No clean shed exists, so the zap dissipated against the gold ring.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'e4', side: 'white', types: 'p' },
            { sq: 'd5', side: 'black', types: 'rk', shield: true },
          ],
        },
      },
    ],
  },
  {
    id: 'winning',
    title: 'Winning the Game',
    blurb: 'Zap protects the last King; victory comes by checkmate.',
    rulesPage: 'Winning: Checkmate',
    steps: [
      {
        title: 'The last King is protected',
        text: [
          'There is no victory by wave function collapse. If Zap would remove the final King possibility, it leaves King alone and tries the next most valuable identity on every affected piece.',
          'A side that temporarily has no King possibility from some other resolution keeps playing. Protect a friendly piece and Heal can restore King when the cheaper identities are unavailable.',
        ],
        physics: "The contact interaction preserves a royal branch: when the King projection would empty the royal sector, the zap operator falls through to the next permitted amplitude.",
        interactive: {
          prompt: 'Black’s only maybe-King is the Queen-or-King on e5. Jump d2 → f3 and touch it.',
          pieces: [
            { id: 'WN', side: 'white', square: 'd2', types: 'n', moved: true },
            { id: 'W2', side: 'white', square: 'a1', types: 'pnbrqk' },
            { id: 'BA', side: 'black', square: 'e5', types: 'qk', moved: true },
            { id: 'BB', side: 'black', square: 'h8', types: 'r', moved: true },
          ],
          goal: { kind: 'move', from: 'd2', to: 'f3' },
          success: 'ROYAL SAFEGUARD. King was the usual first target, but it was Black’s final royal possibility. Zap skipped it and removed Queen instead, leaving a revealed King. The game continues toward checkmate.',
        },
        board: {
          files: 6,
          ranks: 6,
          pieces: [
            { sq: 'f3', side: 'white', types: 'n' },
            { sq: 'e5', side: 'black', types: 'k', zap: true },
            { sq: 'h6', side: 'black', types: 'r' },
          ],
        },
      },
      {
        title: 'The revealed king',
        text: [
          'When the census leaves a side exactly one maybe-King and it collapses to a KNOWN King, the classical rules return for it: it cannot be left capturable, and cornering it is checkmate.',
          'The quantum midgame is checkless; the endgame is chess. Arrows and the red ring mark a revealed king under fire.',
        ],
        physics: "Once royal amplitude is confined to a single pure state, threat operators act on it classically. The endgame inherits the classical game's boundary conditions — check, mate, stalemate.",
        interactive: {
          prompt: 'A revealed king on h8, boxed in by its own pawns. Finish it: a1 → a8.',
          pieces: [
            { id: 'WR', side: 'white', square: 'a1', types: 'r', moved: true },
            { id: 'WK', side: 'white', square: 'c3', types: 'k', moved: true },
            { id: 'BK', side: 'black', square: 'h8', types: 'k', moved: true },
            { id: 'BP1', side: 'black', square: 'g7', types: 'p', moved: true },
            { id: 'BP2', side: 'black', square: 'h7', types: 'p', moved: true },
          ],
          goal: { kind: 'move', from: 'a1', to: 'a8' },
          success: 'Checkmate — the classic back-rank mate, alive and well. Once a king stands revealed, four hundred years of chess technique apply unchanged.',
        },
        board: {
          files: 5,
          ranks: 5,
          pieces: [
            { sq: 'd5', side: 'black', types: 'k' },
            { sq: 'b5', side: 'white', types: 'r' },
          ],
          arrows: [{ from: 'b5', to: 'd5', side: 'white' }],
        },
      },
      {
        title: 'Draws',
        text: [
          'Stalemate: no legal move for a side that is not lost — drawn. Fifty quiet moves with no capture, no definite pawn move, no promotion, and no information gained — drawn. The same FULL quantum state three times — drawn.',
          'Collapsing and zapping count as progress, so active play never runs the clock down. Now go play. Your pieces do not know who they are — teach them the hard way.',
        ],
        physics: "Positions repeat only if their full quantum states are identical — possibility sets and all. Equality of the classical shadow is not equality of the state.",
        interactive: {
          prompt: 'Last exercise. Make any move at all — then go play a real game.',
          pieces: [
            { id: 'W1', side: 'white', square: 'c2', types: 'pnbrqk' },
            { id: 'W2', side: 'white', square: 'f2', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'd6', types: 'pnbrqk' },
          ],
          goal: { kind: 'any' },
          success: 'That collapse counted as progress — information gained resets the fifty-move clock, so active quantum play never runs it down. Class dismissed: your pieces await their identities.',
        },
        board: {
          files: 4,
          ranks: 4,
          pieces: [
            { sq: 'b2', side: 'white', types: 'pnbrqk' },
            { sq: 'c3', side: 'black', types: 'pnbrqk' },
          ],
        },
      },
    ],
  },
  {
    id: 'castling',
    title: 'Quantum Castling',
    blurb: 'Any two back-rank pieces that might be Rook and King.',
    rulesPage: 'Castling (Rook–King Pairing)',
    steps: [
      {
        title: 'Anyone can castle',
        text: [
          'Castling works between ANY two pieces on your BACK RANK whose possibilities still include both Rook and King — moved or not, with a clear path between them. Normal chess is just one arrangement.',
          'Click one, then the other. They slide toward each other and meet in the middle. Once per game — use it wisely.',
        ],
        physics: "Castling is a joint measurement of two systems onto the {|R⟩, |K⟩} subspace — performed on any back-rank pair whose amplitudes still overlap it.",
        interactive: {
          prompt: 'Castle: click one of your back-rank pieces, then click the other.',
          pieces: [
            { id: 'WB', side: 'white', square: 'b1', types: 'pnbrqk' },
            { id: 'WG', side: 'white', square: 'g1', types: 'pnbrqk' },
            { id: 'B1', side: 'black', square: 'h8', types: 'pnbrqk' },
          ],
          goal: { kind: 'castle' },
          success: 'Castled! Both partners collapsed to Rook-or-King and met in the middle. Which is which stays an open question — the census will settle it the moment the King is confirmed anywhere.',
        },
        board: {
          files: 8,
          ranks: 3,
          pieces: [
            { sq: 'b1', side: 'white', types: 'pnbrqk' },
            { sq: 'g1', side: 'white', types: 'pnbrqk' },
          ],
          highlights: ['d1', 'e1'],
        },
      },
      {
        title: 'Two maybe-kings',
        text: [
          'Both pieces collapse to exactly Rook-or-King. No special bond ties them afterward — the census alone keeps the story straight: the moment ANY piece is confirmed as the King, every other piece loses King from its possibilities.',
          'A castled pair keeps the royal identity spread across two pieces, which can make the revealed-King endgame harder for your opponent to force.',
        ],
        physics: "The castle is a projective measurement onto the rook-king subspace — nothing more. Which piece is which stays undetermined until the census resolves it.",
        interactive: {
          prompt: 'Resolve one partner: slide d1 up the board like a Rook (d1 → d5) and watch e1.',
          pieces: [
            { id: 'WA', side: 'white', square: 'd1', types: 'rk', moved: true, castled: true },
            { id: 'WB', side: 'white', square: 'e1', types: 'rk', moved: true, castled: true },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd1', to: 'd5' },
          success: 'Only a Rook slides four squares, so d1 IS the Rook. Its old partner keeps both faces — and protecting it can still HEAL it back toward a wider superposition.',
        },
        board: {
          files: 8,
          ranks: 3,
          pieces: [
            { sq: 'd1', side: 'white', types: 'rk' },
            { sq: 'e1', side: 'white', types: 'rk' },
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
            { sq: 'c4', side: 'white', types: 'pnbrqk' },
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
          success: 'Only a pawn steps straight ahead, so it promoted: now Knight, Bishop, Rook or Queen, funded by one of your pawn slots — and wearing the promotion bar beneath it. Pawn is gone forever.',
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
          'A promoted piece wears a solid bar beneath it — the mark of an identity funded by a pawn slot. Promotion fires once per piece, and heals never return Pawn to it.',
          'Whether the promotion "really happened" stays entangled with your pawn pool: if your other pieces are later all confirmed as pawns, the promotion branch dies and the piece snaps back to its surviving identities.',
        ],
        physics: "The promotion branch remains entangled with the shared pawn pool. Confirm eight pawns elsewhere and the branch destructively interferes: the piece snaps back to its surviving amplitudes.",
        interactive: {
          prompt: 'Protect this promoted Knight-or-Queen: step d3 → d4 to touch it — and see what does NOT come back.',
          pieces: [
            { id: 'WP', side: 'white', square: 'c5', types: 'nq', moved: true, promoted: true },
            { id: 'W2', side: 'white', square: 'd3', types: 'prqk', moved: true },
            { id: 'B1', side: 'black', square: 'g8', types: 'pnbrqk' },
            { id: 'B2', side: 'black', square: 'a8', types: 'pnbrqk' },
          ],
          goal: { kind: 'move', from: 'd3', to: 'd4' },
          success: 'The heal returned Bishop — skipping Pawn entirely. A heal never gives Pawn back to a promoted piece: the bar is a permanent service stripe.',
        },
        board: {
          files: 4,
          ranks: 4,
          pieces: [{ sq: 'b4', side: 'white', types: 'nbq', chevrons: true, heal: true }],
        },
      },
    ],
  },
];

export function getLessonById(id) {
  return LESSONS.find((l) => l.id === id) || null;
}
