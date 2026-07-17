// frontend/src/account/AccountModal.jsx
// Purpose: Sign in / sign up and, once signed in, the player's profile:
// username, tier badge, rating, and recent saved games.
// Imports From: ../theme.js, ../components/IconButton.jsx, ../components/ModalShell.jsx,
//   ./gameSync.js, ./supabaseClient.js
// Exported To: ../App.jsx

import React, { useEffect, useRef, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { X as XIcon, User as UserIcon, Sparkles as SparklesIcon } from 'lucide-react';
import { fetchMyGames } from './gameSync.js';
import { supabase } from './supabaseClient.js';
import {
  PREMIUM_FEATURES, PREMIUM_PRICE_LABEL, PREMIUM_PRICE_VALUE, PREMIUM_PITCH,
  TIP_PITCH, TIP_PRICE_LABEL, TIP_PRICE_VALUE,
  startCheckout, startTipCheckout, openBillingPortal, isAdFree, isTipper,
  tipReviewAvailable, markTipReviewUsed,
} from './billing.js';
import { uploadAvatar } from './avatarUpload.js';
import { taglineOptions } from '../sayings/sayingsCatalog.js';
import { PRODUCT_EVENT, trackProductEvent } from '../analytics/productEvents.js';
import './AccountModal.css';

export default function AccountModal({
  open = false,
  onClose = () => {},
  auth, // the useAuth() bundle from App
  upsellSource = 'account',
  billingReturn = null, // 'success' | 'cancelled' | null (from ?premium= redirect)
  onReviewGame = () => {}, // premium: open the game review modal for a saved game
  onAccountCreated = () => {}, // triggered after successful sign up
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'info'|'error', text }
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [games, setGames] = useState([]);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [taglineDraft, setTaglineDraft] = useState('');
  const avatarInputRef = useRef(null);
  const upsellViewedRef = useRef(false);

  const { authEnabled, user, profile, refreshProfile, signIn, signUp, signOut, resetPassword, updatePassword, recoveryMode } = auth;
  const isPaid = Boolean(profile && profile.tier === 'paid');

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
      if (user && !auth.isDevPreview) fetchMyGames(user).then(setGames);
      else setGames([]);
    }
  }, [open, user, profile, billingReturn]);

  useEffect(() => {
    if (!open) {
      upsellViewedRef.current = false;
      return;
    }
    if (user && !isPaid && !upsellViewedRef.current) {
      trackProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_VIEWED, { source: upsellSource });
      upsellViewedRef.current = true;
    }
  }, [open, user, isPaid, upsellSource]);

  const blockDevPreviewAction = () => {
    if (!import.meta.env.DEV || !auth.isDevPreview) return false;
    setBusy(false);
    setNotice({ kind: 'info', text: 'Dev account preview is visual only — no profile or billing changes were sent.' });
    return true;
  };

  if (!open) return null;

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
    if (error) {
      setNotice({ kind: 'error', text: error.message });
    } else {
      if (needsConfirmation) {
        setNotice({ kind: 'info', text: 'Account created — check your email for the confirmation link, then sign in.' });
      }
      trackProductEvent(PRODUCT_EVENT.ACCOUNT_CREATED, { method: 'email' });
      onAccountCreated();
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      setNotice({ kind: 'error', text: 'Enter your email address first.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await resetPassword(email.trim());
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else setNotice({ kind: 'info', text: 'Password reset link sent! Check your email.' });
  };

  const handleUpdatePassword = async () => {
    if (!password.trim()) {
      setNotice({ kind: 'error', text: 'Enter a new password.' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else setNotice({ kind: 'info', text: 'Password successfully updated.' });
  };

  const handleSaveUsername = async () => {
    if (blockDevPreviewAction()) return;
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
    if (blockDevPreviewAction()) return;
    trackProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED, {
      source: upsellSource,
      offer: 'subscription',
    });
    setBusy(true);
    setNotice(null);
    const { url, error } = await startCheckout();
    if (url) {
      trackProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED, {
        source: upsellSource,
        offer: 'subscription',
        value: PREMIUM_PRICE_VALUE,
      });
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not start checkout.' });
  };

  const handleTip = async () => {
    if (blockDevPreviewAction()) return;
    trackProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED, {
      source: upsellSource,
      offer: 'tip',
    });
    setBusy(true);
    setNotice(null);
    const { url, error } = await startTipCheckout();
    if (url) {
      trackProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED, {
        source: upsellSource,
        offer: 'tip',
        value: TIP_PRICE_VALUE,
      });
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not start checkout.' });
  };

  const handleManageSubscription = async () => {
    if (blockDevPreviewAction()) return;
    setBusy(true);
    setNotice(null);
    const { url, error } = await openBillingPortal();
    if (url) { window.location.assign(url); return; }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not open the billing portal.' });
  };

  // Taglines are picked from the character roster, never typed — the draft
  // must be one of the unlocked characters' taglines (or empty to clear).
  const handleSaveTagline = async () => {
    if (blockDevPreviewAction()) return;
    if (!supabase || !user) return;
    const options = taglineOptions({ isPaid });
    const tagline = options.some((o) => o.tagline === taglineDraft) ? taglineDraft : '';
    setBusy(true);
    const { error } = await supabase.from('qc_profiles').update({ tagline: tagline || null }).eq('id', user.id);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else {
      setNotice({ kind: 'info', text: tagline ? 'Tagline saved.' : 'Tagline cleared.' });
      refreshProfile();
    }
  };

  const handleAvatarFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (blockDevPreviewAction()) return;
    if (!file || !user) return;
    setBusy(true);
    setNotice(null);
    const { url, error } = await uploadAvatar(user, file);
    if (error) {
      setBusy(false);
      setNotice({ kind: 'error', text: error });
      return;
    }
    const { error: profileError } = await supabase.from('qc_profiles').update({ avatar_url: url }).eq('id', user.id);
    setBusy(false);
    if (profileError) setNotice({ kind: 'error', text: profileError.message });
    else {
      setNotice({ kind: 'info', text: 'Profile pic updated.' });
      refreshProfile();
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      closeOnBackdrop
      zIndex={1001}
      ariaLabelledBy="qc-account-title"
      backdropClassName="qc-account-backdrop"
      panelClassName="qc-account-panel qc-am-panel"
      panelStyle={{}}
    >
        <div className="qc-am-header">
          <h2 id="qc-account-title" className="qc-am-title"><UserIcon size={20} color="#61dafb" /> {user ? 'Your Account' : 'Sign In'}</h2>
          <IconButton
            icon={XIcon} size={20} title="Close" ariaLabel="Close account panel"
            className="qc-account-close" onClick={onClose} width={36} height={36} radius={8}
            bg="rgba(255,255,255,0.1)" color="#fff" hoverInvert={true} shadow="transparent"
          />
        </div>

        {!authEnabled ? (
          <div className="qc-am-notice-error">Accounts are not configured in this build.</div>
        ) : recoveryMode ? (
          <>
            <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
              Enter your new password below.
            </p>
            <div>
              <div className="qc-am-label">New Password</div>
              <input
                className="qc-account-password qc-am-input" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button type="button" className="qc-account-signin qc-am-primary-btn" style={{flex: 1}} disabled={busy} onClick={handleUpdatePassword}>
                {busy ? 'Working…' : 'Set New Password'}
              </button>
            </div>
          </>
        ) : !user ? (
          <>
            {authMode === 'signin' && (
              <>
                <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Sign in to continue. Accounts are optional but keep your rating and history safe.
                </p>
                <div>
                  <div className="qc-am-label">Email</div>
                  <input
                    className="qc-account-email qc-am-input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  />
                </div>
                <div>
                  <div className="qc-am-label">Password</div>
                  <input
                    className="qc-account-password qc-am-input" type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  />
                </div>
                {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="button" className="qc-account-signin qc-am-primary-btn" disabled={busy} onClick={handleSignIn}>
                    {busy ? 'Working…' : 'Sign In'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => { setAuthMode('forgot'); setNotice(null); }}>
                      Forgot Password?
                    </button>
                    <button type="button" className="qc-am-link-ghost" onClick={() => { setAuthMode('signup'); setNotice(null); }}>
                      Create an Account
                    </button>
                  </div>
                </div>
              </>
            )}

            {authMode === 'signup' && (
              <>
                <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Join the ladder! Sign up to get a rating and keep your recent games.
                </p>
                <div>
                  <div className="qc-am-label">Username (shown when you play)</div>
                  {/* Display name, not a credential: without the explicit
                      nickname autocomplete the browser autofills the SAVED
                      login here when making a second account (it sits above
                      email+password, so password managers guess "username"). */}
                  <input
                    className="qc-account-signup-username qc-am-input" value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)} maxLength={20}
                    placeholder="e.g. WaveFunctionWrecker"
                    name="qc-display-name" autoComplete="nickname"
                  />
                </div>
                <div>
                  <div className="qc-am-label">Email</div>
                  <input
                    className="qc-account-email qc-am-input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  />
                </div>
                <div>
                  <div className="qc-am-label">Password</div>
                  <input
                    className="qc-account-password qc-am-input" type="password" value={password}
                    onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                  />
                </div>
                {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="button" className="qc-account-signup qc-am-create-btn" disabled={busy} onClick={handleSignUp}>
                    {busy ? 'Working…' : 'Create Account'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => { setAuthMode('signin'); setNotice(null); }}>
                      Already have an account? Sign In
                    </button>
                  </div>
                </div>
              </>
            )}

            {authMode === 'forgot' && (
              <>
                <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>
                <div>
                  <div className="qc-am-label">Email</div>
                  <input
                    className="qc-account-email qc-am-input" type="email" value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  />
                </div>
                {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="button" className="qc-account-signin qc-am-primary-btn" disabled={busy} onClick={handleResetPassword}>
                    {busy ? 'Working…' : 'Send Reset Link'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => { setAuthMode('signin'); setNotice(null); }}>
                      Back to Sign In
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="qc-am-stat-row">
              <div className="qc-am-stat">
                <div className="qc-am-stat-label">Rating</div>
                <div className="qc-am-stat-value">{profile ? profile.rating : '…'}</div>
              </div>
              <div className="qc-am-stat">
                <div className="qc-am-stat-label">Rated Games</div>
                <div className="qc-am-stat-value">{profile ? profile.games_played : '…'}</div>
              </div>
              <div className="qc-am-stat">
                <div className="qc-am-stat-label">Tier</div>
                <div style={{ marginTop: 8 }}><span className={profile && profile.tier === 'paid' ? 'qc-am-tier-badge-paid' : 'qc-am-tier-badge-free'}>{profile ? profile.tier : 'free'}</span></div>
              </div>
            </div>

            <div>
              <div className="qc-am-label">Username</div>
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  className="qc-account-username qc-am-input" style={{ flex: 1 }} value={usernameDraft}
                  onChange={(e) => setUsernameDraft(e.target.value)} maxLength={24}
                />
                <button type="button" className="qc-am-ghost-btn" disabled={busy} onClick={handleSaveUsername}>Save</button>
              </div>
            </div>

            {isPaid ? (
              <div>
                <div className="qc-am-label">Profile Pic & Tagline <span style={{ color: '#f6c445', textShadow: '0 0 8px rgba(246,196,69,0.6)' }}>★</span></div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 4 }}>
                  <div
                    style={{
                      width: 60, height: 60, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                      border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 900, fontSize: 24, color: '#a8b2d1',
                      boxShadow: '0 0 15px rgba(0,0,0,0.5) inset'
                    }}
                  >
                    {profile && profile.avatar_url ? (
                      <img src={profile.avatar_url} alt="Your avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (usernameDraft[0] || '?').toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <select
                        className="qc-account-tagline qc-am-input" style={{ flex: 1 }} value={taglineDraft}
                        onChange={(e) => setTaglineDraft(e.target.value)}
                        aria-label="Pick a tagline from your characters"
                      >
                        <option value="">No tagline</option>
                        {taglineOptions({ isPaid }).map((o) => (
                          <option key={o.id} value={o.tagline}>{`${o.name} — “${o.tagline}”`}</option>
                        ))}
                      </select>
                      <button type="button" className="qc-am-ghost-btn" disabled={busy} onClick={handleSaveTagline}>Save</button>
                    </div>
                    <div>
                      <input
                        ref={avatarInputRef} type="file" accept="image/*"
                        style={{ display: 'none' }} onChange={handleAvatarFile}
                      />
                      <button
                        type="button" className="qc-account-avatar-upload qc-am-ghost-btn" disabled={busy}
                        onClick={() => {
                          if (blockDevPreviewAction()) return;
                          if (avatarInputRef.current) avatarInputRef.current.click();
                        }}
                      >
                        {busy ? 'Working…' : 'Upload profile pic'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}

            {isPaid ? (
              <div className="qc-am-premium-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div className="qc-am-premium-title"><SparklesIcon size={18} /> Premium active</div>
                <button
                  type="button" className="qc-account-manage-sub qc-am-ghost-btn"
                  style={{ borderColor: 'rgba(246,196,69,0.4)', color: '#f6c445' }}
                  disabled={busy} onClick={handleManageSubscription}
                >
                  {busy ? 'Working…' : 'Manage subscription'}
                </button>
              </div>
            ) : (
              <div className="qc-account-premium qc-am-premium-card">
                <div className="qc-am-premium-title"><SparklesIcon size={18} /> Go Premium · {PREMIUM_PRICE_LABEL}</div>
                <div style={{ fontSize: 13.5, color: '#fff', lineHeight: 1.55 }}>
                  {PREMIUM_PITCH}
                </div>
                <ul className="qc-am-feature-list">
                  {PREMIUM_FEATURES.map((f) => (
                    <li key={f} className="qc-am-feature-item"><span style={{ color: '#f6c445', textShadow: '0 0 5px rgba(246,196,69,0.5)' }}>✦</span> {f}</li>
                  ))}
                </ul>
                <button
                  type="button" className="qc-account-upgrade qc-am-gold-btn"
                  disabled={busy} onClick={handleUpgrade}
                  style={{ marginTop: 4 }}
                >
                  {busy ? 'Working…' : `Upgrade — ${PREMIUM_PRICE_LABEL}`}
                </button>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    borderTop: '1px solid rgba(246,196,69,0.25)', paddingTop: 12, marginTop: 4,
                  }}
                >
                  <span style={{ flex: '1 1 200px', fontSize: 12.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                    {isAdFree(profile)
                      ? `You're ad-free until ${new Date(profile.ad_free_until).toLocaleDateString()} with one engine review a day — thanks for the tip! ♥`
                      : TIP_PITCH}
                  </span>
                  <button
                    type="button" className="qc-account-tip qc-am-ghost-btn"
                    style={{ borderColor: 'rgba(246,196,69,0.3)', color: '#f6c445' }}
                    disabled={busy} onClick={handleTip}
                    title="One-time payment — no ads for a year (tips stack)"
                  >
                    {busy ? 'Working…' : `Tip ${TIP_PRICE_LABEL}`}
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
                  The subscription renews automatically at {PREMIUM_PRICE_LABEL} until cancelled —
                  cancel anytime from this panel. The tip is a one-time payment. Secure payment via Stripe.{' '}
                  <a href="/terms.html" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms</a>
                  {' · '}
                  <a href="/terms.html#refunds" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>Refund policy</a>
                </div>
              </div>
            )}

            <div>
              <div className="qc-am-label">
                Saved Games ({isPaid ? games.length : `${games.length} of last 10`})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto', paddingRight: 4 }}>
                {games.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#a8b2d1', fontStyle: 'italic' }}>Finished games will appear here.</div>
                ) : (
                  games.map((g) => (
                    <div key={g.id} className="qc-account-game-row qc-am-game-row">
                      <span className={`qc-am-result-${g.result}`}>{g.result}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
                        vs {g.opponent}{g.opponent_rating ? ` (${g.opponent_rating})` : ''} <span style={{color: '#a8b2d1'}}>· {g.user_side}</span>
                      </span>
                      <span style={{ color: '#a8b2d1', fontWeight: 600 }}>
                        {g.rating_after ? `${g.rating_before}→${g.rating_after}` : 'unrated'}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11.5 }}>{new Date(g.created_at).toLocaleDateString()}</span>
                      <button
                        type="button"
                        className={`qc-account-review-game qc-am-review-btn ${isPaid || (isTipper(profile) && tipReviewAvailable(user.id)) ? 'premium' : 'standard'}`}
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
                          if (isTipper(profile)) {
                            if (!tipReviewAvailable(user.id)) {
                              setNotice({ kind: 'info', text: "You've used today's tip review — another unlocks tomorrow, or go Premium for unlimited reviews." });
                              return;
                            }
                            const opened = await onReviewGame(g);
                            if (opened !== false) markTipReviewUsed(user.id);
                            return;
                          }
                          setNotice({ kind: 'info', text: 'Game review with engine moves is a Premium feature — upgrade above for unlimited, or tip $3 for one review a day.' });
                        }}
                      >
                        Review
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <span style={{ fontSize: 12.5, color: '#a8b2d1' }}>Logged in as <strong style={{color: '#fff'}}>{user.email}</strong></span>
              <button type="button" className="qc-account-signout qc-am-ghost-btn" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => { signOut(); }}>
                Sign Out
              </button>
            </div>
          </>
        )}
    </ModalShell>
  );
}
