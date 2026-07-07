// frontend/src/account/AccountModal.jsx
// Purpose: Sign in / sign up and, once signed in, the player's profile:
// username, tier badge, rating, and recent saved games.
// Imports From: ../theme.js, ../components/IconButton.jsx, ./gameSync.js, ./supabaseClient.js
// Exported To: ../App.jsx

import React, { useEffect, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import { X as XIcon, User as UserIcon, Sparkles as SparklesIcon } from 'lucide-react';
import { fetchMyGames } from './gameSync.js';
import { supabase } from './supabaseClient.js';
import {
  PREMIUM_FEATURES, PREMIUM_PRICE_LABEL, PREMIUM_PITCH, TIP_PITCH, TIP_PRICE_LABEL,
  startCheckout, startTipCheckout, openBillingPortal, isAdFree, isTipper,
  tipReviewAvailable, markTipReviewUsed,
} from './billing.js';
import { uploadAvatar } from './avatarUpload.js';

export default function AccountModal({
  open = false,
  onClose = () => {},
  auth, // the useAuth() bundle from App
  billingReturn = null, // 'success' | 'cancelled' | null (from ?premium= redirect)
  onReviewGame = () => {}, // premium: open the game review modal for a saved game
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'info'|'error', text }
  const [games, setGames] = useState([]);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [taglineDraft, setTaglineDraft] = useState('');
  const avatarInputRef = useRef(null);

  const { authEnabled, user, profile, refreshProfile, signIn, signUp, signOut } = auth;

  useEffect(() => {
    if (open) {
      if (billingReturn === 'success') {
        const upgraded = profile && profile.tier === 'paid';
        setNotice({
          kind: 'info',
          text: upgraded
            ? 'Welcome to Premium — your account is upgraded!'
            : 'Payment received — welcome to Premium! Your account upgrades within a few seconds.',
        });
      } else if (billingReturn === 'tip_thanks') {
        setNotice({
          kind: 'info',
          text: 'Thank you for the tip! ♥ Ads are off on this account for the next year.',
        });
      } else if (billingReturn === 'cancelled') {
        setNotice({ kind: 'info', text: 'Checkout cancelled — nothing was charged.' });
      } else {
        setNotice(null);
      }
      setBusy(false);
      setUsernameDraft(profile && profile.username ? profile.username : '');
      setTaglineDraft(profile && profile.tagline ? profile.tagline : '');
      if (user) fetchMyGames(user).then(setGames);
      else setGames([]);
    }
  }, [open, user, profile, billingReturn]);

  if (!open) return null;

  const styles = {
    backdrop: {
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001,
    },
    panel: {
      width: 'min(94vw, 460px)', maxHeight: '88vh', overflowY: 'auto',
      borderRadius: 12, border: `1px solid ${theme.border}`, backgroundColor: theme.cardBackground,
      boxShadow: `0 12px 32px ${theme.shadow}`, color: theme.textPrimary, padding: 18,
      boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 12,
    },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    title: { margin: 0, fontSize: '1.1rem', fontWeight: 900, letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 },
    label: { fontSize: 12, color: theme.textSecondary, fontWeight: 700, letterSpacing: '0.04em' },
    input: {
      width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 8,
      border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.05)',
      color: theme.textPrimary, fontSize: 14,
    },
    primaryBtn: {
      padding: '9px 14px', borderRadius: 8, border: 'none', backgroundColor: theme.primary,
      color: theme.secondary, fontWeight: 800, fontSize: 13, cursor: 'pointer',
    },
    ghostBtn: {
      padding: '9px 14px', borderRadius: 8, border: `1px solid ${theme.border}`,
      background: 'transparent', color: theme.textPrimary, fontWeight: 700, fontSize: 13, cursor: 'pointer',
    },
    notice: (kind) => ({
      fontSize: 13, lineHeight: 1.45, borderRadius: 8, padding: '8px 11px',
      background: kind === 'error' ? 'rgba(255,59,48,0.12)' : 'rgba(79,195,247,0.10)',
      border: `1px solid ${kind === 'error' ? 'rgba(255,59,48,0.5)' : 'rgba(79,195,247,0.45)'}`,
      color: theme.textPrimary,
    }),
    statRow: { display: 'flex', gap: 10, flexWrap: 'wrap' },
    stat: {
      flex: '1 1 100px', border: `1px solid ${theme.border}`, borderRadius: 10,
      padding: '10px 12px', background: 'rgba(255,255,255,0.03)',
    },
    statLabel: { fontSize: 10.5, color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 800 },
    statValue: { fontSize: 20, fontWeight: 900, marginTop: 2 },
    tierBadge: (tier) => ({
      display: 'inline-block', padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 800,
      letterSpacing: '0.06em', textTransform: 'uppercase',
      background: tier === 'paid' ? 'rgba(246,196,69,0.15)' : 'rgba(255,255,255,0.07)',
      border: `1px solid ${tier === 'paid' ? '#f6c445' : theme.border}`,
      color: tier === 'paid' ? '#f6c445' : theme.textSecondary,
    }),
    gameRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      padding: '7px 10px', borderRadius: 8, border: `1px solid ${theme.border}`,
      background: 'rgba(255,255,255,0.02)', fontSize: 12.5,
    },
    resultChip: (r) => ({
      fontWeight: 900, textTransform: 'uppercase', fontSize: 11,
      color: r === 'win' ? '#7ee787' : r === 'loss' ? '#ff7b72' : theme.textSecondary,
    }),
    premiumCard: {
      border: '1px solid rgba(246,196,69,0.55)', borderRadius: 10, padding: '12px 14px',
      background: 'linear-gradient(160deg, rgba(246,196,69,0.10), rgba(246,196,69,0.03))',
      display: 'flex', flexDirection: 'column', gap: 8,
    },
    premiumTitle: {
      display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 900,
      color: '#f6c445', letterSpacing: '0.04em',
    },
    featureList: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 },
    featureItem: { fontSize: 12.5, color: theme.textPrimary, display: 'flex', alignItems: 'center', gap: 7 },
    goldBtn: {
      padding: '9px 14px', borderRadius: 8, border: 'none', backgroundColor: '#f6c445',
      color: '#1a1a1a', fontWeight: 900, fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start',
    },
  };

  const handleSignIn = async () => {
    setBusy(true);
    setNotice(null);
    const { error } = await signIn(email.trim(), password);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
  };

  const handleSignUp = async () => {
    const name = signupUsername.trim();
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) {
      setNotice({ kind: 'error', text: 'Pick a username first: 3–20 characters, letters/numbers/dashes/underscores.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    // Availability pre-check (DB unique index is the real enforcement).
    try {
      const { data: available, error: rpcError } = await supabase.rpc('qc_username_available', { name });
      if (!rpcError && available === false) {
        setBusy(false);
        setNotice({ kind: 'error', text: `"${name}" is taken — try another username.` });
        return;
      }
    } catch (_) {
      // rpc missing (schema not installed yet): the signup trigger's
      // collision fallback still guarantees a unique name.
    }
    const { error, needsConfirmation } = await signUp(email.trim(), password, name);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else if (needsConfirmation) setNotice({ kind: 'info', text: 'Account created — check your email for the confirmation link, then sign in.' });
  };

  const handleSaveUsername = async () => {
    if (!supabase || !user) return;
    const name = usernameDraft.trim().slice(0, 24);
    if (!name) return;
    setBusy(true);
    const { error } = await supabase.from('qc_profiles').update({ username: name }).eq('id', user.id);
    setBusy(false);
    if (error) {
      const friendly = /duplicate key|unique/i.test(error.message) ? `"${name}" is taken — try another username.` : error.message;
      setNotice({ kind: 'error', text: friendly });
    }
    else {
      setNotice({ kind: 'info', text: 'Username saved.' });
      refreshProfile();
    }
  };

  // All three redirect away from the app on success; busy stays on until then.
  const handleUpgrade = async () => {
    setBusy(true);
    setNotice(null);
    const { url, error } = await startCheckout();
    if (url) { window.location.assign(url); return; }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not start checkout.' });
  };

  const handleTip = async () => {
    setBusy(true);
    setNotice(null);
    const { url, error } = await startTipCheckout();
    if (url) { window.location.assign(url); return; }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not start checkout.' });
  };

  const handleManageSubscription = async () => {
    setBusy(true);
    setNotice(null);
    const { url, error } = await openBillingPortal();
    if (url) { window.location.assign(url); return; }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not open the billing portal.' });
  };

  const isPaid = Boolean(profile && profile.tier === 'paid');

  const handleSaveTagline = async () => {
    if (!supabase || !user) return;
    const tagline = taglineDraft.trim().slice(0, 80);
    setBusy(true);
    const { error } = await supabase.from('qc_profiles').update({ tagline: tagline || null }).eq('id', user.id);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else {
      setNotice({ kind: 'info', text: tagline ? 'Tagline saved.' : 'Tagline cleared.' });
      refreshProfile();
    }
  };

  return (
    <div className="qc-account-backdrop" style={styles.backdrop} onClick={onClose}>
      <div
        className="qc-account-panel"
        style={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="qc-account-title"
      >
        <div style={styles.header}>
          <h2 id="qc-account-title" style={styles.title}><UserIcon size={18} color={theme.primary} /> {user ? 'Your Account' : 'Sign In'}</h2>
          <IconButton
            icon={XIcon} size={20} title="Close" ariaLabel="Close account panel"
            className="qc-account-close" onClick={onClose} width={36} height={36} radius={8}
            bg={theme.secondary} color={theme.error} hoverInvert={true} shadow="transparent"
          />
        </div>

        {!authEnabled ? (
          <div style={styles.notice('error')}>Accounts are not configured in this build.</div>
        ) : !user ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: theme.textSecondary, lineHeight: 1.5 }}>
              Accounts are optional — sign up to get a rating and keep your recent games.
            </p>
            <div style={{ ...styles.premiumCard, padding: '9px 12px', gap: 5 }}>
              <div style={{ ...styles.premiumTitle, fontSize: 12.5 }}>
                <SparklesIcon size={14} /> Premium · {PREMIUM_PRICE_LABEL}
              </div>
              <div style={{ fontSize: 12, color: theme.textPrimary, lineHeight: 1.5 }}>
                {PREMIUM_PITCH}
              </div>
              <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
                {PREMIUM_FEATURES.join(' · ')}. {TIP_PITCH} Sign up to do either.
              </div>
            </div>
            <div>
              <div style={styles.label}>Username (shown when you play — required to sign up)</div>
              <input
                className="qc-account-signup-username" style={styles.input} value={signupUsername}
                onChange={(e) => setSignupUsername(e.target.value)} maxLength={20}
                placeholder="e.g. WaveFunctionWrecker"
              />
            </div>
            <div>
              <div style={styles.label}>Email</div>
              <input
                className="qc-account-email" style={styles.input} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              />
            </div>
            <div>
              <div style={styles.label}>Password</div>
              <input
                className="qc-account-password" style={styles.input} type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
              />
            </div>
            {notice ? <div style={styles.notice(notice.kind)}>{notice.text}</div> : null}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="qc-account-signin" style={styles.primaryBtn} disabled={busy} onClick={handleSignIn}>
                {busy ? 'Working…' : 'Sign In'}
              </button>
              <button type="button" className="qc-account-signup" style={styles.ghostBtn} disabled={busy} onClick={handleSignUp}>
                Create Account
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={styles.statRow}>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Rating</div>
                <div style={styles.statValue}>{profile ? profile.rating : '…'}</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Rated Games</div>
                <div style={styles.statValue}>{profile ? profile.games_played : '…'}</div>
              </div>
              <div style={styles.stat}>
                <div style={styles.statLabel}>Tier</div>
                <div style={{ marginTop: 6 }}><span style={styles.tierBadge(profile ? profile.tier : 'free')}>{profile ? profile.tier : 'free'}</span></div>
              </div>
            </div>

            <div>
              <div style={styles.label}>Username</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="qc-account-username" style={{ ...styles.input, flex: 1 }} value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)} maxLength={24}
                />
                <button type="button" style={styles.ghostBtn} disabled={busy} onClick={handleSaveUsername}>Save</button>
              </div>
            </div>

            {isPaid ? (
              <div>
                <div style={styles.label}>Profile Pic & Tagline <span style={{ color: '#f6c445' }}>★</span></div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                  <div
                    style={{
                      width: 52, height: 52, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
                      border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 20, color: theme.textSecondary,
                    }}
                  >
                    {profile && profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="Your avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (usernameDraft[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="qc-account-tagline" style={{ ...styles.input, flex: 1 }} value={taglineDraft}
                        onChange={(e) => setTaglineDraft(e.target.value)} maxLength={80}
                        placeholder="Your tagline — shown on your player bar"
                      />
                      <button type="button" style={styles.ghostBtn} disabled={busy} onClick={handleSaveTagline}>Save</button>
                    </div>
                    <div>
                      <input
                        ref={avatarInputRef} type="file" accept="image/*"
                        style={{ display: 'none' }} onChange={handleAvatarFile}
                      />
                      <button
                        type="button" className="qc-account-avatar-upload" style={styles.ghostBtn} disabled={busy}
                        onClick={() => avatarInputRef.current && avatarInputRef.current.click()}
                      >
                        {busy ? 'Working…' : 'Upload profile pic'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {notice ? <div style={styles.notice(notice.kind)}>{notice.text}</div> : null}

            {isPaid ? (
              <div style={{ ...styles.premiumCard, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={styles.premiumTitle}><SparklesIcon size={15} /> Premium active</div>
                <button
                  type="button" className="qc-account-manage-sub" style={styles.ghostBtn}
                  disabled={busy} onClick={handleManageSubscription}
                >
                  {busy ? 'Working…' : 'Manage subscription'}
                </button>
              </div>
            ) : (
              <div className="qc-account-premium" style={styles.premiumCard}>
                <div style={styles.premiumTitle}><SparklesIcon size={15} /> Go Premium · {PREMIUM_PRICE_LABEL}</div>
                <div style={{ fontSize: 12.5, color: theme.textPrimary, lineHeight: 1.55 }}>
                  {PREMIUM_PITCH}
                </div>
                <ul style={styles.featureList}>
                  {PREMIUM_FEATURES.map((f) => (
                    <li key={f} style={styles.featureItem}><span style={{ color: '#f6c445' }}>✦</span> {f}</li>
                  ))}
                </ul>
                <button
                  type="button" className="qc-account-upgrade" style={styles.goldBtn}
                  disabled={busy} onClick={handleUpgrade}
                >
                  {busy ? 'Working…' : `Upgrade — ${PREMIUM_PRICE_LABEL}`}
                </button>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    borderTop: '1px solid rgba(246,196,69,0.25)', paddingTop: 9, marginTop: 2,
                  }}
                >
                  <span style={{ flex: '1 1 200px', fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
                    {isAdFree(profile)
                      ? `You're ad-free until ${new Date(profile.ad_free_until).toLocaleDateString()} with one engine review a day — thanks for the tip! ♥`
                      : TIP_PITCH}
                  </span>
                  <button
                    type="button" className="qc-account-tip" style={styles.ghostBtn}
                    disabled={busy} onClick={handleTip}
                    title="One-time payment — no ads for a year (tips stack)"
                  >
                    {busy ? 'Working…' : `Tip ${TIP_PRICE_LABEL}`}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: theme.textSecondary }}>
                  The subscription renews automatically at {PREMIUM_PRICE_LABEL} until cancelled —
                  cancel anytime from this panel. The tip is a one-time payment. Secure payment via Stripe.{' '}
                  <a href="/terms.html" target="_blank" rel="noopener" style={{ color: 'inherit' }}>Terms</a>
                  {' · '}
                  <a href="/terms.html#refunds" target="_blank" rel="noopener" style={{ color: 'inherit' }}>Refund policy</a>
                </div>
              </div>
            )}

            <div>
              <div style={{ ...styles.label, marginBottom: 6 }}>
                Saved Games ({isPaid ? games.length : `${games.length} of last 10`})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {games.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: theme.textSecondary }}>Finished games will appear here.</div>
                ) : (
                  games.map((g) => (
                    <div key={g.id} className="qc-account-game-row" style={styles.gameRow}>
                      <span style={styles.resultChip(g.result)}>{g.result}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        vs {g.opponent}{g.opponent_rating ? ` (${g.opponent_rating})` : ''} · {g.user_side}
                      </span>
                      <span style={{ color: theme.textSecondary }}>
                        {g.rating_after ? `${g.rating_before}→${g.rating_after}` : 'unrated'}
                      </span>
                      <span style={{ color: theme.textSecondary }}>{new Date(g.created_at).toLocaleDateString()}</span>
                      <button
                        type="button"
                        className="qc-account-review-game"
                        style={{
                          padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 800, cursor: 'pointer',
                          border: `1px solid ${isPaid || (isTipper(profile) && tipReviewAvailable(user.id)) ? '#f6c445' : theme.border}`,
                          background: 'transparent',
                          color: isPaid || (isTipper(profile) && tipReviewAvailable(user.id)) ? '#f6c445' : theme.textSecondary,
                        }}
                        title={
                          isPaid
                            ? 'Review this game with the engine'
                            : isTipper(profile)
                              ? (tipReviewAvailable(user.id)
                                ? "Review this game with the engine (today's tip review)"
                                : "Today's tip review is used — another unlocks tomorrow")
                              : 'Game review is a Premium feature'
                        }
                        onClick={async () => {
                          if (isPaid) { onReviewGame(g); return; }
                          // Tippers get one engine review per day.
                          if (isTipper(profile)) {
                            if (!tipReviewAvailable(user.id)) {
                              setNotice({ kind: 'info', text: "You've used today's tip review — another unlocks tomorrow, or go Premium for unlimited reviews." });
                              return;
                            }
                            const opened = await onReviewGame(g);
                            if (opened !== false) markTipReviewUsed(user.id);
                            return;
                          }
                          setNotice({ kind: 'info', text: 'Game review with engine moves is a Premium feature — upgrade above for unlimited, or tip $5 for one review a day.' });
                        }}
                      >
                        Review
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: theme.textSecondary }}>{user.email}</span>
              <button type="button" className="qc-account-signout" style={styles.ghostBtn} onClick={() => { signOut(); }}>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
