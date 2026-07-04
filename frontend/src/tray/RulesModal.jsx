// frontend/src/tray/RulesModal.jsx
// Purpose: Modal dialog that presents the Quantum Chess rulebook as a paginated book with bottom navigation and icon-only controls using the inverting IconButton style. Describes check threats overlay, king removal after each move, quantum castling with entanglement, quantum promotion, en passant phantom captures, measurement/decoherence, and checkmate.
// Imports From: ../theme.js, ../components/IconButton.jsx
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import { X as XIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, BookOpen as BookOpenIcon, Play as PlayIcon, GraduationCap as GraduationCapIcon } from 'lucide-react';
import { LESSONS } from '../tutorial/lessons.js';

export default function RulesModal({ open = false, onClose = () => {}, onPlayLesson = null, initialPageTitle = null }) {
  const pages = useMemo(
    () => [
      {
        title: 'Turn Order',
        content: [
          'White moves first. Players alternate turns for the entire game.',
          'Only pieces belonging to the side to move can be selected and moved on a given turn.',
          'Current engine enforcement: Turn order is enforced. Other rules described here are being implemented progressively.',
        ],
      },
      {
        title: 'Quantum Pieces & Superposition',
        content: [
          'Each piece starts as a superposition of all classical piece types: Pawn, Knight, Bishop, Rook, Queen, and King.',
          'When a piece makes a move, its wave function collapses to the subset of types that could legally make that move.',
          'Example: Moving along a clear diagonal collapses the piece to Bishop–Queen (since both can move diagonally).',
        ],
      },
      {
        title: 'Global Conservation',
        content: [
          'Your team owns exactly 16 slots, fixed for the whole game: 8 Pawn, 2 Knight, 2 Bishop, 2 Rook, 1 Queen, 1 King. Every piece — living or captured — occupies exactly one slot in every consistent world.',
          'If two pieces fully collapse to Bishops, no other piece may collapse to Bishop thereafter.',
          'If three pieces are Bishop–Queen superpositions, no other piece may include Bishop or Queen in its possible set.',
          'The slot pool is conserved; the team’s silhouette is not. Promotion lets a pawn slot appear on the board as a heavy piece (see Quantum Promotion), so a side can hold, say, two Queens — as long as one of them is a pawn slot in disguise.',
        ],
      },
      {
        title: 'Captures & Collapse',
        content: [
          'On capture, the captured piece collapses immediately to its least valuable non-King possibility: P < N < B < R < Q.',
          "The captured piece is displayed in the capturing player's bar; newly captured icons appear at the far right and fill from right to left.",
          "Captured pieces count toward the opponent's conserved totals. Example: If White captures a Black piece and it collapses to a Knight, and Black already has one Knight confirmed on the board, that becomes two total Knights for Black and Knight must be removed from the remaining possibilities of all other Black pieces as capacity is exhausted.",
          'Kings never appear as the capture collapse result.',
        ],
      },
      {
        title: 'Quantum Promotion',
        content: [
          'Trigger: When a piece that still includes Pawn in its possibilities reaches the farthest rank (rank 8 for White, rank 1 for Black), it immediately promotes.',
          'Promotion is a branch, not an assertion. In the worlds where the crossing piece was a Pawn, it becomes any of Knight, Bishop, Rook, Queen — a pawn slot leaves the pool and a heavy piece enters play in its place. In the worlds where it was never a Pawn, nothing happened: it keeps its other original identities.',
          'The piece carries both branches: its promotion-funded possibilities (marked with * in the scope panel) and its surviving original possibilities. Pawn itself is always removed — in every pawn-world the promotion was forced.',
          'One pawn out, one heavy in: A promotion-funded identity occupies one of your 8 pawn slots, not a Knight/Bishop/Rook/Queen slot. This is exactly classical chess — nine queens are legal because eight of them are pawns in disguise. Base limits (2N, 2B, 2R, 1Q) only cap original identities.',
          'Entanglement with your pawns: Whether the promotion "really happened" is entangled with the rest of your army through the shared pawn pool. If your other pieces are later confirmed as all 8 pawns, the promotion branch dies: the promoted piece snaps back to its surviving original identities and any extra heavy vanishes from its possibilities.',
          'Conversely, confirming the promoted piece as a pawn-funded heavy consumes a pawn slot, so at most 7 other pieces can still be Pawns — the solver prunes your team accordingly.',
          'Multiple promotions stack: each one is its own branch, each pawn-funded identity consumes its own pawn slot, and the global solver keeps every possibility consistent with some real chess history.',
          'Order of operations on a promoting move: apply move and any capture-collapse, then apply promotion (remove P, add promotion-funded N/B/R/Q), then run global conservation to fixpoint, then apply end-of-turn King pruning for threatened squares.',
          'Capturing a promoted piece still collapses it on capture to its least valuable possibility at that time. Its ledger entry stays honest: a captured promotion-funded Knight still occupies a pawn slot in every consistent world.',
          'Promotion fires once per piece. A piece that has already promoted wears chevrons top-center, in its own side’s color — sitting exactly where Pawn would have been drawn, the one identity it can never hold again. It can never promote again, and Pawn never returns to it through recoherence.',
        ],
      },
      {
        title: 'Checks and Threats',
        content: [
          'A piece begins checking once it has two or fewer remaining possibilities. It threatens all squares that any of its remaining classical types would attack.',
          "Threat overlay: On your turn, all squares threatened by the opponent's checking pieces are tinted faint red on the board.",
          'End-of-turn king pruning: After a move is made, any of the mover\'s pieces that remain on threatened squares can no longer be Kings; King is removed from their superposition. This enforces the classic rule: you cannot end your turn with your King in check.',
        ],
      },
      {
        title: 'Castling (Rook–King Pairing)',
        content: [
          'First-move ethos: Castling applies to any two of your unmoved pieces whose current possibilities include both Rook and King. They do not need to be on the classical starting squares — normal chess is just one arrangement.',
          'How to castle: Click one eligible piece, then click a second eligible piece on the same rank to initiate the castle preview and confirm.',
          'Once per game: Each side may castle only once per game.',
          'Requirement 1 — Clear path: The two selected pieces must share the same rank with only empty squares strictly between them.',
          'Requirement 2 — No checks through: None of the squares strictly between the two pieces may be under attack by an opposing checking piece at the moment of castling.',
          'Requirement 3 — Meet in the middle: Both pieces move simultaneously toward each other and finish on the two most central empty squares between them. If the number of empty squares between is even, each moves exactly half the gap; if odd, they occupy the two center-biased squares closer to the board center.',
          'Requirement 4 — Collapse set: After castling, both pieces reduce to Rook–King only; all other types are removed from their superposition.',
          'Entanglement: The castled pair becomes an entangled, anti-correlated pair — in every consistent world exactly one of them is the King and the other the Rook. The moment either partner resolves to a single type (by capture, check pruning, or measurement), the other instantly collapses to the complementary type.',
          'Castling never captures; all destination squares must be empty. The move consumes your entire turn.',
          'Conservation applies: If Rook or King capacity is already exhausted by prior collapses/superpositions, castling that would violate conservation is disallowed.',
          'Destination squares may be threatened; if so, end-of-turn king pruning may remove King from one or both castling pieces per the Checks and Threats rules.',
        ],
      },
      {
        title: 'En Passant (Phantom Capture)',
        content: [
          'Trigger: An enemy piece makes a two-square first-move advance while Pawn is still among its possibilities (from any rank — normal chess is just one arrangement, so any first move may be a pawn double-step).',
          'The capture: On your immediately following turn only, any of your pieces that still includes Pawn, standing on the same rank as the arrival square and on an adjacent file, may move diagonally forward into the crossed (passed-through) square and remove the passing piece — even though that square is empty.',
          'You measure the passer in the pawn basis: the captured piece collapses to a Pawn and is removed, consistent with the least-valuable capture-collapse rule.',
          'The measurement cuts both ways: your capturing piece collapses to exactly Pawn — only a pawn can capture en passant. En passant is a self-measurement you choose to make.',
          'Disambiguation: If your piece could also reach the crossed square as a quiet move (e.g., as a Bishop or Queen), the game asks which world you are asserting: the phantom capture (collapse to Pawn, remove the passer) or the quiet move (normal collapse rules, no capture).',
          'Window: One turn, exactly as in classical chess. If you do not capture immediately, the opportunity vanishes.',
        ],
      },
      {
        title: 'Measurement Pulses',
        content: [
          'Moving is observing. When your piece completes a move, it performs a soft measurement on every enemy piece it could capture from its new square, using any of its remaining possible types. Observation MARKS the piece — the damage lands later.',
          'Deferred damage: a marked piece loses 1 coherence point when ITS OWNER next completes a move — unless the owner moves that very piece, which dodges the hit entirely and resets it to full coherence. A threatened piece is a piece being told to move.',
          'The pulse is as wide as your reach: a piece planted in a busy center can measure several enemies at once, while a quiet retreat that touches nothing measures nothing. Passivity earns no information.',
          'Risk for information: to measure deeply you must stand in capture-contact with the enemy — which usually means your instrument is itself attackable.',
          'Castling pulses from both castled pieces. An en passant capturer pulses as the Pawn it has become.',
          'Coherence: every superposed piece carries 3 coherence points, shown as the triangle gauge in its center (always visible on pieces with 3+ possibilities). At 0 the piece sheds its LEAST valuable remaining possibility — Pawn, Knight, Bishop, Rook, Queen order; King never — and its coherence resets to 3. Symmetric with recoherence: gain cheap, lose cheap. Losing your cheap identities is real pain — the piece becomes expensive to hang and loses its cheap capture threats.',
          'Soft measurement never fully collapses a piece: only pieces with three or more possibilities are affected, and observation can never reduce a piece below two. Full collapse happens only through the piece’s own moves, captures, and check pruning — a soft measurement narrows reality, it never finishes the job.',
          'This holds even indirectly: if shedding a type would force ANY piece — through team conservation or entanglement — into a single definite identity, the measurement dissipates instead. The target keeps its possibilities and its coherence resets, protected by the very structure the observation would have over-determined.',
          'Recovery by self-measurement: moving a piece restores its own coherence to 3 (the move collapses it by the normal rules, on your terms rather than your opponent’s). A piece under sustained observation is a piece being told to move or be defined.',
          'Feedback: after each move, rings appear on every piece that move’s pulse touched, drawn in the moving side’s measurement color (editable in Settings). They fade when the next move lands.',
          'Recoherence: a piece with two or fewer possibilities slowly diffuses back into superposition. Three dots beneath the piece, in its own side’s color, show the progress — they appear empty the moment a piece collapses. The clock does not start until the piece has sat a full turn at zero: after that grace turn, each of its owner’s moves fills one dot, and at 3 the piece regains its least valuable feasible possibility — never King, never Pawn on a promoted piece or on the promotion rank, and never anything conservation has ruled out (two Knights already captured means Knight cannot come back).',
          'The Zeno lock: any pulse that touches a nearly-defined piece resets its recoherence to zero — including the fresh grace turn before the clock can restart. A watched piece never re-blurs — keep your attackers trained on their collapsed pieces to freeze them, or let your own knights slip out of observation and regain their mystery.',
          'Entangled castle partners never recohere; their identities stay bound to each other. Instead of a recoherence clock they carry a chain-link mark beneath them, in their own side’s color.',
        ],
      },
      {
        title: 'Draws',
        content: [
          'Stalemate: If the side to move has no legal move at all and is not in check (their King is not kingless-or-uniquely-capturable), the game is drawn immediately.',
          'Fifty-move rule: The game is drawn after 50 consecutive full moves with no progress. Progress means any capture, any definite pawn move, any promotion — or any net loss of possibilities anywhere on the board. Collapsing superpositions is information gained, the quantum analog of irreversible progress, so active quantum play never runs the clock down.',
          'Threefold repetition: If the exact same position occurs three times, the game is drawn. "Exact" includes the full quantum state — every piece’s possibility sets, promotion branches, coherence, first-move rights, castling state, side to move, and any live en passant window. Two positions that merely look alike on the board are not the same position.',
          'Because measurement damage and collapses are part of the position, repetition is only possible once the boards have gone truly quiet — shuffling while anything is still decohering never repeats.',
          'Draws can also be agreed between players, and a player may resign at any time.',
        ],
      },
      {
        title: 'Checkmate',
        content: [
          'Definition: You deliver checkmate when, after your move is fully resolved, every legal reply by your opponent results in one of the following: (a) no piece on their side still includes King in its possibilities, or (b) exactly one piece on their side still includes King and you have at least one legal capture on that unique King on your next move.',
          'No check requirement: The capture test in (b) ignores the “checking” status of your pieces. Any of your pieces that could legally capture the unique King square using any of its remaining classical move types qualifies—even if it currently has more than two possibilities and would not show as checking.',
          'Timing: Checkmate is evaluated after the following sequence on your move: apply the move and any capture-collapse, apply promotion, run global conservation to a fixpoint, then prune Kings from any of your pieces ending the turn on threatened squares. Only then is the opponent’s reply space analyzed for checkmate.',
          'Practical effect: If every opponent reply would leave them kingless or with a single capturable King, the game ends immediately—you win.',
        ],
      },
    ],
    []
  );

  // page 0 is the Contents front page; rules pages render at index + 1.
  const [page, setPage] = useState(0);
  const total = pages.length + 1;

  useEffect(() => {
    if (open) {
      if (initialPageTitle) {
        const idx = pages.findIndex((p) => p.title === initialPageTitle);
        setPage(idx >= 0 ? idx + 1 : 0);
      } else {
        setPage(0);
      }
    }
  }, [open, initialPageTitle, pages]);

  if (!open) return null;

  const canPrev = page > 0;
  const canNext = page < total - 1;
  const jumpToTitle = (title) => {
    const idx = pages.findIndex((p) => p.title === title);
    if (idx >= 0) setPage(idx + 1);
  };

  const styles = {
    backdrop: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    panel: {
      width: 'min(92vw, 720px)',
      maxWidth: '720px',
      borderRadius: 12,
      border: `1px solid ${theme.border}`,
      backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`,
      color: theme.textPrimary,
      padding: 16,
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      maxHeight: '88vh',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    headerTitleWrap: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      margin: 0,
      fontSize: '1.2rem',
      fontWeight: 900,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
    },
    body: {
      flex: 1,
      overflow: 'auto',
      border: `1px solid ${theme.border}`,
      borderRadius: 10,
      padding: 16,
      background: 'rgba(255,255,255,0.03)',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
    },
    pageTitle: {
      margin: 0,
      fontSize: '1.05rem',
      fontWeight: 800,
      letterSpacing: '0.03em',
    },
    list: {
      margin: 0,
      paddingLeft: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      lineHeight: 1.5,
    },
    footer: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 12,
    },
    pageIndicator: {
      marginLeft: 'auto',
      marginRight: 'auto',
      fontSize: 12,
      color: theme.textSecondary,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      fontWeight: 800,
      userSelect: 'none',
    },
    dots: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    },
    dot: (active) => ({
      width: 8,
      height: 8,
      borderRadius: 999,
      background: active ? theme.primary : theme.border,
      cursor: 'pointer',
      boxShadow: active ? `0 0 10px ${theme.primary}` : 'none',
    }),
    tocIntro: {
      margin: 0,
      fontSize: 13,
      color: theme.textSecondary,
      lineHeight: 1.5,
    },
    tocList: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    },
    tocRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      border: `1px solid ${theme.border}`,
      borderRadius: 8,
      padding: '8px 12px',
      background: 'rgba(255,255,255,0.02)',
    },
    tocTitle: {
      fontSize: 13.5,
      fontWeight: 800,
      letterSpacing: '0.02em',
    },
    tocBlurb: {
      fontSize: 12,
      color: theme.textSecondary,
      marginTop: 2,
    },
    tocActions: {
      display: 'flex',
      gap: 6,
      flex: 'none',
    },
    tocBtn: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '6px 10px',
      borderRadius: 7,
      border: 'none',
      background: theme.primary,
      color: theme.secondary,
      fontWeight: 800,
      fontSize: 12,
      cursor: 'pointer',
    },
    tocBtnGhost: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '6px 10px',
      borderRadius: 7,
      border: `1px solid ${theme.border}`,
      background: 'transparent',
      color: theme.textPrimary,
      fontWeight: 700,
      fontSize: 12,
      cursor: 'pointer',
    },
    tocMoreTitle: {
      fontSize: 11,
      color: theme.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 800,
      marginTop: 4,
    },
  };

  const handlePrev = () => {
    if (canPrev) setPage((p) => p - 1);
  };

  const handleNext = () => {
    if (canNext) setPage((p) => p + 1);
  };

  const handleDot = (idx) => setPage(idx);

  return (
    <div className="qc-rules-backdrop" style={styles.backdrop} onClick={onClose}>
      <div
        className="qc-rules-panel"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-rules-title"
      >
        <div className="qc-rules-header" style={styles.header}>
          <div className="qc-rules-header-title-wrap" style={styles.headerTitleWrap}>
            <BookOpenIcon size={20} color={theme.primary} />
            <h2 id="qc-rules-title" className="qc-rules-title" style={styles.title}>Quantum Chess Rulebook</h2>
          </div>
          <IconButton
            icon={XIcon}
            size={20}
            title="Close rulebook"
            ariaLabel="Close rulebook"
            className="qc-rules-close"
            onClick={onClose}
            width={36}
            height={36}
            radius={8}
            bg={theme.secondary}
            color={theme.error}
            hoverInvert={true}
            shadow="transparent"
          />
        </div>

        <div className="qc-rules-body" style={styles.body}>
          {page === 0 ? (
            <>
              <h3 className="qc-rules-page-title" style={styles.pageTitle}>Contents</h3>
              <p style={styles.tocIntro}>
                Interactive lessons walk each rule through with diagrams. Play a lesson, or jump straight to the fine print.
              </p>
              <div className="qc-rules-toc" style={styles.tocList}>
                {LESSONS.map((ls, i) => (
                  <div key={`toc-${ls.id}`} className="qc-rules-toc-row" style={styles.tocRow}>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.tocTitle}>{i + 1}. {ls.title}</div>
                      <div style={styles.tocBlurb}>{ls.blurb}</div>
                    </div>
                    <div style={styles.tocActions}>
                      {onPlayLesson ? (
                        <button
                          type="button"
                          className="qc-rules-toc-play"
                          style={styles.tocBtn}
                          onClick={() => onPlayLesson(ls.id)}
                          title={`Play the "${ls.title}" lesson`}
                        >
                          <PlayIcon size={13} /> Lesson
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="qc-rules-toc-read"
                        style={styles.tocBtnGhost}
                        onClick={() => jumpToTitle(ls.rulesPage)}
                        title={`Read the "${ls.rulesPage}" section`}
                      >
                        <BookOpenIcon size={13} /> Rules
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={styles.tocMoreTitle}>More sections</div>
              <div className="qc-rules-toc-more" style={styles.tocList}>
                {pages
                  .filter((p) => !LESSONS.some((l) => l.rulesPage === p.title))
                  .map((p) => (
                    <div key={`toc-extra-${p.title}`} className="qc-rules-toc-row" style={styles.tocRow}>
                      <div style={styles.tocTitle}>{p.title}</div>
                      <button
                        type="button"
                        className="qc-rules-toc-read"
                        style={styles.tocBtnGhost}
                        onClick={() => jumpToTitle(p.title)}
                      >
                        <BookOpenIcon size={13} /> Rules
                      </button>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <>
              <h3 className="qc-rules-page-title" style={styles.pageTitle}>{pages[page - 1].title}</h3>
              <ul className="qc-rules-list" style={styles.list}>
                {pages[page - 1].content.map((line, idx) => (
                  <li key={`rule-line-${page}-${idx}`}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="qc-rules-footer" style={styles.footer}>
          <IconButton
            icon={ChevronLeftIcon}
            size={18}
            title="Previous page"
            ariaLabel="Previous page"
            className="qc-rules-prev"
            onClick={handlePrev}
            width={40}
            height={40}
            radius={10}
            bg={theme.secondary}
            color={theme.primary}
            hoverInvert={true}
            style={{ opacity: canPrev ? 1 : 0.5, pointerEvents: canPrev ? 'auto' : 'none' }}
          />

          <div className="qc-rules-page-indicator" style={styles.pageIndicator}>
            Page {page + 1} of {total}
          </div>

          <IconButton
            icon={ChevronRightIcon}
            size={18}
            title="Next page"
            ariaLabel="Next page"
            className="qc-rules-next"
            onClick={handleNext}
            width={40}
            height={40}
            radius={10}
            bg={theme.secondary}
            color={theme.primary}
            hoverInvert={true}
            style={{ opacity: canNext ? 1 : 0.5, pointerEvents: canNext ? 'auto' : 'none' }}
          />
        </div>

        <div className="qc-rules-dots" style={styles.dots} aria-label="page dots navigation">
          {Array.from({ length: total }, (_, idx) => (
            <div
              key={`rules-dot-${idx}`}
              className="qc-rules-dot"
              style={styles.dot(idx === page)}
              onClick={() => handleDot(idx)}
              role="button"
              aria-label={`Go to page ${idx + 1}`}
              title={`Go to page ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
