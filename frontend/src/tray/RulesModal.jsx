// frontend/src/tray/RulesModal.jsx
// Purpose: Modal dialog that presents the Quantum Chess rulebook as a paginated book with bottom navigation and icon-only controls using the inverting IconButton style. Describes superposition & collapse, the census, zaps/heals/shields, captures, wave-function collapse & revealed-king checkmate, quantum castling, en passant, promotion, and draws.
// Imports From: ../theme.js, ../components/IconButton.jsx, ../components/ModalShell.jsx
// Exported To: ../App.jsx

import React, { useEffect, useMemo, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
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
        ],
      },
      {
        title: 'Quantum Pieces & Superposition',
        content: [
          'Each piece starts as a superposition of all classical piece types: Pawn, Knight, Bishop, Rook, Queen, and King.',
          'When a piece makes a move, its wave function collapses to the subset of types that could legally make that move.',
          'Example: moving along a clear diagonal collapses the piece to Bishop–Queen (since both can move diagonally).',
          'No square is privileged: a pawn can live on the back rank, and any two-square straight first move might be a pawn double-step. The classical setup is just one of the worlds this game can collapse into.',
        ],
      },
      {
        title: 'The Census (Conservation)',
        content: [
          'Your team owns exactly 16 slots, fixed for the whole game: 8 Pawn, 2 Knight, 2 Bishop, 2 Rook, 1 Queen, 1 King. Every piece — living or captured — occupies exactly one slot in every consistent world.',
          'Claims propagate instantly. The moment two of your pieces are KNOWN knights, the census strips Knight from every other piece of yours. If three pieces are Bishop–Queen superpositions, no other piece may include Bishop or Queen.',
          'Captured pieces pin the ledger from the outside: each one sits in the bins as a definite type and counts against its side\'s totals forever.',
          'The census also bends heals: an identity that is fully claimed elsewhere can never be regained — the heal skips it and gives the next one up the ladder (see The Heal).',
          'The slot pool is conserved; the team\'s silhouette is not. Promotion lets a pawn slot appear on the board as a heavy piece (see Quantum Promotion).',
        ],
      },
      {
        title: 'The Zap',
        content: [
          'Moving is touching. When your piece completes a move, it touches every square it could capture on from its landing square — and every enemy piece it touches is ZAPPED.',
          'You touch as your CHEAPEST self: the reach comes from the least valuable type the mover still holds (P < N < B < R < Q < K). A fresh six-type blur pokes like a pawn; a confirmed queen sweeps like one. Collapsing your own pieces is what arms them.',
          'A zap removes the MOST valuable possibility the target can cleanly lose, trying King, then Queen, Rook, Bishop, Knight, Pawn. "Cleanly" means the loss changes nothing else on the board: a shed whose census cascade would rewrite any other piece is skipped, and the zap walks down to the next type.',
          'Zaps strike TOGETHER. Every struck piece is judged against the board exactly as your piece landed — no zap sees another zap\'s result — and all the sheds land as one volley. If the combined volley\'s census cascade would ripple beyond the struck pieces themselves, the WHOLE volley fizzles: a zap never chooses between victims. They shed together or shield together.',
          'One exception outranks the guard: a zap that erases a side\'s LAST King possibility always lands, cascade and all — that is the win by wave function collapse (see Winning).',
          'A fully known piece (one possibility) has nothing left to lose; zaps pass through it. A piece where nothing sheds cleanly shows a SHIELD instead (see Shields).',
          'Feedback: a red circle spins out over every piece your move zapped.',
        ],
      },
      {
        title: 'The Heal',
        content: [
          'The same touch that zaps enemies HEALS friends: every friendly piece your move touches regains its cheapest missing identity — Pawn first, then Knight, Bishop, Rook, Queen.',
          'Heals bloom TOGETHER, like zaps: each touched friend finds its regain against the board as your piece landed, and all regains take root as one volley. If the census cannot let every regain take root at once, the whole volley dissipates — no piece is favored over another.',
          'King never comes back. Pawn never returns to a promoted piece, or to a piece standing on its own promotion rank.',
          'The census must accept the regain. If an identity is fully claimed elsewhere the heal overflows upward: with both your knights known, a bare pawn you protect becomes a Pawn–BISHOP.',
          'Defense is regeneration: a protected army does not just hold its ground — it re-blurs. Leave a wounded piece unattended and it stays exactly as collapsed as your opponent made it.',
          'Feedback: a green circle blooms over every piece your move healed.',
        ],
      },
      {
        title: 'Shields',
        content: [
          'Sometimes a zap finds nothing it can remove cleanly: every possibility the target holds is load-bearing, and removing any of them would force other pieces to change. The zap fizzles — the piece is SHIELDED.',
          'Shields come from closed groups: N pieces sharing exactly N identities (say, three survivors that are exactly {Queen-King, Rook-King, Rook-Queen}). No member can lose anything locally.',
          'Break the group and the shield drops: capture a member, or force a collapse elsewhere that reopens the ledger.',
          'A volley shields together: when several struck pieces could each shed alone but not all at once, no one is chosen — every one of them shields. Symmetric situations resolve symmetrically; nothing in this game is decided by which square comes first in the alphabet.',
          'The one zap a shield never stops: erasing the last King possibility a side has. The terminal zap ignores the guard.',
          'Feedback: a gold ring pops over a shielded piece so a fizzled zap never reads as a bug.',
        ],
      },
      {
        title: 'Captures',
        content: [
          'On capture, the captured piece collapses immediately to its least valuable possibility: P < N < B < R < Q — and King only when King is all it could be.',
          'Strip first, then take: capturing a fresh superposition usually kills a mere pawn. Zap a piece\'s cheap identities away first and it has to die as something expensive.',
          'The captured piece is displayed in the capturing player\'s bin, in its true colors, as the type it died as. Captured pieces count toward the census forever.',
          'Kings die exactly two ways: their possibility is zapped off a piece, or the piece holding it is captured like any other piece. There is no check for a superposed king — only for a revealed one (see Winning).',
        ],
      },
      {
        title: 'Winning: Collapse & Checkmate',
        content: [
          'Wave function collapse: you win the moment your opponent has NO piece that could still be the King — zapped off their last maybe-King, or captured with it. The game ends instantly.',
          'The revealed king: when a side\'s King possibility narrows to a single KNOWN King, the classical rules return for it. It may never be left standing where it can be captured, and a revealed king with no escape is CHECKMATE, exactly as in classical chess.',
          'The quantum midgame is checkless — a maybe-King is a possibility, not a target. Redundancy is the defense: keep your maybe-Kings plural.',
          'Check arrows and the pulsing red ring mark a revealed king under fire (Settings → Visual Reminders).',
        ],
      },
      {
        title: 'Castling (Rook–King Pairing)',
        content: [
          'First-move ethos: castling applies to any two of your unmoved pieces whose current possibilities include both Rook and King. They do not need to be on the classical starting squares — normal chess is just one arrangement.',
          'How to castle: click one eligible piece, then click a second eligible piece on the same rank to initiate the castle.',
          'Once per game: each side may castle only once per game.',
          'Requirement 1 — Clear path: the two selected pieces must share the same rank with only empty squares strictly between them.',
          'Requirement 2 — Meet in the middle: both pieces move simultaneously toward each other and finish on the two most central empty squares between them.',
          'Requirement 3 — Collapse set: after castling, both pieces reduce to Rook–King only; all other types are removed from their superposition.',
          'No strings attached: after the castle the two pieces are ordinary Rook-or-King superpositions — no special link between them. The census keeps the story straight: if either piece is ever confirmed as the King, no other piece can be one.',
          'A castled pair is two extra maybe-Kings — real cover against wave function collapse. And like any friendly piece, a castled partner you touch can HEAL back toward a wider superposition.',
          'Castling never captures; all destination squares must be empty. The move consumes your entire turn. Conservation applies: if Rook or King capacity is exhausted, the castle is disallowed.',
        ],
      },
      {
        title: 'En Passant (Phantom Capture)',
        content: [
          'Trigger: an enemy piece makes a two-square first-move advance while Pawn is still among its possibilities (from any rank — any first move may be a pawn double-step).',
          'The capture: on your immediately following turn only, any of your pieces that still includes Pawn, standing on the same rank as the arrival square and on an adjacent file, may move diagonally forward into the crossed (passed-through) square and remove the passing piece — even though that square is empty.',
          'You measure the passer in the pawn basis: the captured piece collapses to a Pawn and is removed, consistent with the least-valuable capture rule.',
          'The measurement cuts both ways: your capturing piece collapses to exactly Pawn — only a pawn captures en passant. It then touches as the pawn it has become: its landing zaps and heals like any other move.',
          'Disambiguation: if your piece could also reach the crossed square as a quiet move, the game asks which world you are asserting.',
          'Window: one turn, exactly as in classical chess.',
        ],
      },
      {
        title: 'Quantum Promotion',
        content: [
          'Trigger: when a piece that still includes Pawn in its possibilities reaches the farthest rank (rank 8 for White, rank 1 for Black), it immediately promotes.',
          'Promotion is a branch, not an assertion. In the worlds where the crossing piece was a Pawn, it becomes any of Knight, Bishop, Rook, Queen — a pawn slot leaves the pool and a heavy piece enters play in its place. In the worlds where it was never a Pawn, nothing happened: it keeps its other original identities.',
          'One pawn out, one heavy in: a promotion-funded identity occupies one of your 8 pawn slots, not a Knight/Bishop/Rook/Queen slot — nine queens are legal because eight of them are pawns in disguise.',
          'Entanglement with your pawns: whether the promotion "really happened" is entangled with your army through the shared pawn pool. If your other pieces are later confirmed as all 8 pawns, the promotion branch dies and the piece snaps back to its surviving identities.',
          'Promotion fires once per piece. A promoted piece wears a solid bar beneath it — the mark of an identity funded by a pawn slot. Heals never return Pawn to it.',
          'Capturing a promoted piece still collapses it to its least valuable possibility at that time; its ledger entry stays honest.',
        ],
      },
      {
        title: 'Draws',
        content: [
          'Stalemate: if the side to move has no legal move at all and is not lost (their revealed King is not capturable and they still hold a maybe-King), the game is drawn immediately.',
          'Fifty-move rule: the game is drawn after 50 consecutive full moves with no progress. Progress means any capture, any definite pawn move, any promotion — or any net loss of possibilities anywhere on the board. Zaps and collapses are information gained, so active play never runs the clock down. Heals GIVE BACK possibilities, so pure heal-shuffling in a dead position walks straight into the draw.',
          'Threefold repetition: if the exact same position occurs three times, the game is drawn. "Exact" includes the full quantum state — every piece\'s possibility sets, promotion branches, first-move rights, castling state, side to move, and any live en passant window.',
          'Draws can also be agreed between players, and a player may resign at any time.',
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
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      zIndex={1000}
      ariaLabelledBy="qc-rules-title"
      backdropClassName="qc-rules-backdrop"
      panelClassName="qc-rules-panel"
      panelStyle={styles.panel}
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
    </ModalShell>
  );
}
