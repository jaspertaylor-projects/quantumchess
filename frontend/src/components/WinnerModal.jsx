// frontend/src/components/WinnerModal.jsx
// Purpose: End-of-game screen — result headline, a quiet house promo for the
// one-time Premium offer, Play Again, and Premium Game Review.
// Imports From: ../theme.js, ./ModalShell.jsx
// Exported To: ../App.jsx (via AppModals)

import React from 'react';
import { RotateCcw, ChartSpline, Sparkles } from 'lucide-react';
import theme from '../theme.js';
import ModalShell from './ModalShell.jsx';
import ModalCloseButton from './ModalCloseButton.jsx';
import { getBotAvatarUrl, MATCH_UNLOCK_BOTS, PREMIUM_BOTS } from '../ai/bots.js';

export default function WinnerModal({
  open = false,
  winnerText = '',
  title = 'Game Over',
  onClose = () => {},
  onPlayAgain = null,
  playAgainLabel = 'Play Again',
  botUnlockReward = null,
  onRetryBotUnlock = () => {},
  onPlayUnlockedBot = () => {},
  onGameReview = null,
  // premium | locked
  reviewAccess = 'premium',
  reviewRemaining = Infinity,
  reviewNotice = '',
  reviewDisabled = false,
  showPremiumPromo = false,
  onUpgradePromo = () => {},
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
      width: `min(94vw, ${botUnlockReward ? '620px' : '380px'})`,
      display: 'grid',
      gap: 14,
      textAlign: 'center',
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
    unlockBox: {
      display: 'grid', gap: 10, padding: '12px', borderRadius: 14,
      border: '1px solid rgba(127,231,255,0.24)',
      background: 'linear-gradient(135deg, rgba(0,245,255,0.07), rgba(126,87,255,0.05))',
      textAlign: 'left',
    },
    unlockGrid: {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8,
    },
  };

  const reviewHint = reviewAccess === 'locked' ? '$10 once to unlock' : null;

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
      <ModalCloseButton
        onClick={onClose}
        ariaLabel="Close game over screen"
        className="qc-winner-close"
        style={{ position: 'absolute', top: 10, right: 10 }}
      />
      <h2 id="qc-winner-title" className="qc-winner-title" style={styles.title}>{title}</h2>
      <p className="qc-winner-sub" style={styles.sub}>{winnerText || 'Game over.'}</p>

      {botUnlockReward ? (
        <section className="qc-bot-unlock-reward" style={styles.unlockBox} aria-live="polite">
          {botUnlockReward.status === 'loading' ? (
            <div>Unlocking your next bot…</div>
          ) : botUnlockReward.status === 'error' ? (
            <>
              <div>{botUnlockReward.error}</div>
              <button type="button" style={styles.reviewBtn(false)} onClick={onRetryBotUnlock}>Retry unlock</button>
            </>
          ) : botUnlockReward.status === 'complete' ? (
            <div>You have earned all {MATCH_UNLOCK_BOTS.length} match-unlocked bots!</div>
          ) : botUnlockReward.bot ? (
            <>
              <div style={{ fontWeight: 900, fontSize: 17 }}>{botUnlockReward.bot.name} unlocked!</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img src={getBotAvatarUrl(botUnlockReward.bot)} alt="" width="64" height="64" style={{ borderRadius: 999 }} />
                <div style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 1.45 }}>{botUnlockReward.bot.tagline}</div>
              </div>
              <div style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 1.45 }}>
                Every completed human match earns a new bot — win, lose or draw.
                {botUnlockReward.guest ? ' This unlock is saved on this browser.' : ' This unlock is saved to your account.'}
              </div>
              <button type="button" style={styles.reviewBtn(false)} onClick={() => onPlayUnlockedBot(botUnlockReward.bot)}>
                Play {botUnlockReward.bot.name}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {showPremiumPromo ? (
        <div
          className="qc-winner-premium-promo"
          style={styles.promo}
          onClick={onUpgradePromo}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') onUpgradePromo(); }}
        >
          <span style={styles.promoChip}>AD</span>
          <span style={styles.promoText}>
            <span style={styles.promoStrong}>$10 once</span> — unlimited game review, {PREMIUM_BOTS.length} Premium bots, all avatars, and no ads.
          </span>
          <Sparkles size={16} color="#ffd166" style={{ flex: 'none' }} aria-hidden="true" />
        </div>
      ) : null}

      <div className="qc-winner-button-row" style={styles.buttons}>
        {onPlayAgain ? (
          <button type="button" className="qc-winner-play-again" style={styles.primaryBtn} onClick={onPlayAgain} autoFocus>
            <RotateCcw size={17} /> {playAgainLabel}
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
