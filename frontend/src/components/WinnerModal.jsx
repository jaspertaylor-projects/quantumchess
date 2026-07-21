// frontend/src/components/WinnerModal.jsx
// Purpose: End-of-game screen — result headline, a quiet house promo for the
// ad-free tip, and the two actions that matter: Play Again (same queue) and
// Game Review (free for premium/tip; rewarded-ad gated for free users).
// Imports From: ../theme.js, ./ModalShell.jsx
// Exported To: ../App.jsx (via AppModals)

import React from 'react';
import { RotateCcw, ChartSpline, X as XIcon, Sparkles } from 'lucide-react';
import theme from '../theme.js';
import ModalShell from './ModalShell.jsx';

export default function WinnerModal({
  open = false,
  winnerText = '',
  title = 'Game Over',
  onClose = () => {},
  onPlayAgain = null,
  onGameReview = null,
  // premium | tip | ad (rewarded) | limit
  reviewAccess = 'premium',
  reviewRemaining = Infinity,
  reviewNotice = '',
  reviewDisabled = false,
  showTipPromo = false,
  onTipPromo = () => {},
}) {
  const styles = {
    panel: {
      position: 'relative',
      background: 'linear-gradient(165deg, #151a26 0%, #0d1017 62%, #0b0d13 100%)',
      color: '#f2f5fb',
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,0.11)',
      boxShadow: '0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.35)',
      padding: '26px 24px 22px',
      width: 'min(92vw, 380px)',
      display: 'grid',
      gap: 14,
      textAlign: 'center',
    },
    close: {
      position: 'absolute', top: 10, right: 10,
      width: 30, height: 30, display: 'grid', placeItems: 'center',
      borderRadius: 8, border: 'none', background: 'transparent',
      color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
    },
    title: {
      fontSize: '1.45rem', fontWeight: 900, letterSpacing: '-0.015em',
      margin: 0, lineHeight: 1.15,
    },
    sub: { fontSize: '0.92rem', color: 'rgba(235,240,250,0.66)', margin: 0 },
    // The house slot: styled like ad inventory, selling its own removal.
    promo: {
      display: 'flex', alignItems: 'center', gap: 11, textAlign: 'left',
      padding: '11px 13px', borderRadius: 12, cursor: 'pointer',
      border: '1px solid rgba(246,196,69,0.32)',
      background: 'linear-gradient(120deg, rgba(246,196,69,0.09), rgba(246,196,69,0.03))',
    },
    promoChip: {
      flex: 'none', fontSize: 9, fontWeight: 900, letterSpacing: '0.1em',
      color: 'rgba(20,16,4,0.9)', background: 'rgba(246,196,69,0.85)',
      borderRadius: 4, padding: '2px 5px',
    },
    promoText: { fontSize: 12.5, lineHeight: 1.45, color: 'rgba(255,236,190,0.92)' },
    promoStrong: { fontWeight: 800, color: '#ffd166' },
    buttons: { display: 'grid', gap: 9, marginTop: 2 },
    primaryBtn: {
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
      padding: '13px 16px', borderRadius: 12, border: 'none',
      background: 'linear-gradient(120deg, #2ea043, #26873a)',
      color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
      boxShadow: '0 6px 20px rgba(46,160,67,0.28)',
    },
    reviewBtn: (disabled) => ({
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
      padding: '12px 16px', borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.16)',
      background: 'rgba(255,255,255,0.05)',
      color: disabled ? 'rgba(255,255,255,0.35)' : '#e9eefb',
      fontWeight: 800, fontSize: 14.5,
      cursor: disabled ? 'default' : 'pointer',
    }),
    reviewHint: { fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)' },
  };

  const reviewHint = reviewAccess === 'ad'
    ? `watch a short ad · ${reviewRemaining} left today`
    : reviewAccess === 'tip'
      ? `${reviewRemaining} left today`
      : reviewAccess === 'limit' ? 'daily limit reached' : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      closeOnBackdrop={false}
      zIndex={9999}
      ariaLabelledBy="qc-winner-title"
      backdropClassName="qc-winner-overlay"
      panelClassName="qc-winner-modal"
      panelStyle={styles.panel}
    >
      <button type="button" style={styles.close} onClick={onClose} aria-label="Close">
        <XIcon size={17} />
      </button>
      <h2 id="qc-winner-title" className="qc-winner-title" style={styles.title}>{title}</h2>
      <p className="qc-winner-sub" style={styles.sub}>{winnerText || 'Game over.'}</p>

      {showTipPromo ? (
        <div
          className="qc-winner-tip-promo"
          style={styles.promo}
          onClick={onTipPromo}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onTipPromo(); }}
        >
          <span style={styles.promoChip}>AD</span>
          <span style={styles.promoText}>
            <span style={styles.promoStrong}>$5 once</span> — three months with no ads
            + five engine reviews a day.
          </span>
          <Sparkles size={16} color="#ffd166" style={{ flex: 'none' }} aria-hidden="true" />
        </div>
      ) : null}

      <div className="qc-winner-button-row" style={styles.buttons}>
        {onPlayAgain ? (
          <button type="button" className="qc-winner-play-again" style={styles.primaryBtn} onClick={onPlayAgain} autoFocus>
            <RotateCcw size={17} /> Play Again
          </button>
        ) : null}
        {onGameReview ? (
          <button
            type="button"
            className="qc-winner-review"
            style={styles.reviewBtn(reviewDisabled)}
            onClick={reviewDisabled ? undefined : onGameReview}
            aria-disabled={reviewDisabled || undefined}
          >
            <ChartSpline size={16} /> Game Review
            {reviewHint && !reviewDisabled ? <span style={styles.reviewHint}>· {reviewHint}</span> : null}
          </button>
        ) : null}
        {reviewNotice ? <div style={styles.reviewHint}>{reviewNotice}</div> : null}
      </div>
    </ModalShell>
  );
}
