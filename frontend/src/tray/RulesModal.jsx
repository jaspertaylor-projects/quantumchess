// frontend/src/tray/RulesModal.jsx
// Purpose: Modal dialog that presents the Quantum Chess rulebook as a paginated book with bottom navigation and icon-only controls using the inverting IconButton style.
// Imports From: ../theme.js, ../components/IconButton.jsx
// Exported To: ../App.jsx

import React, { useMemo, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import { X as XIcon, ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, BookOpen as BookOpenIcon } from 'lucide-react';

export default function RulesModal({ open = false, onClose = () => {} }) {
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
          'Across your team there are conserved totals matching classical chess: 8 Pawns, 2 Knights, 2 Bishops, 2 Rooks, 1 Queen, 1 King.',
          'If two pieces fully collapse to Bishops, no other piece may collapse to Bishop thereafter.',
          'If three pieces are Bishop–Queen superpositions, no other piece may include Bishop or Queen in its possible set.',
        ],
      },
      {
        title: 'Captures & Collapse',
        content: [
          'On capture, the captured piece collapses immediately to its highest non-king value from: Q > R > B > N > P.',
          'Collapsed capture types count toward global conservation totals.',
          'Kings never appear as the capture collapse result.',
        ],
      },
      {
        title: 'Check Constraint (Preview)',
        content: [
          'Pieces with two or fewer remaining possibilities begin to exert check like classical pieces matching those possibilities.',
          'You cannot end your turn with your King in check. Any pieces left in check cannot be Kings and must remove King from their superposition.',
          'Note: Engine enforcement for this section is planned for a future update.',
        ],
      },
    ],
    []
  );

  const [page, setPage] = useState(0);
  const total = pages.length;

  if (!open) return null;

  const canPrev = page > 0;
  const canNext = page < total - 1;

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
          <h3 className="qc-rules-page-title" style={styles.pageTitle}>{pages[page].title}</h3>
          <ul className="qc-rules-list" style={styles.list}>
            {pages[page].content.map((line, idx) => (
              <li key={`rule-line-${page}-${idx}`}>{line}</li>
            ))}
          </ul>
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
          {pages.map((_, idx) => (
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
