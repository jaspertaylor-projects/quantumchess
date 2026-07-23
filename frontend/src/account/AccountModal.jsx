// frontend/src/account/AccountModal.jsx
// Purpose: Sign in / sign up and, once signed in, the player's profile:
// username, tier badge, rating, and recent saved games.
// Imports From: ../theme.js, ../components/IconButton.jsx, ../components/ModalShell.jsx,
//   ./gameSync.js, ./supabaseClient.js
// Exported To: ../App.jsx

import React, { useEffect, useRef, useState } from 'react';
import theme from '../theme.js';
import ModalCloseButton from '../components/ModalCloseButton.jsx';
import ModalShell from '../components/ModalShell.jsx';
import { Eye, EyeOff, User as UserIcon, Sparkles as SparklesIcon } from 'lucide-react';
import { fetchMyGames } from './gameSync.js';
import { supabase } from './supabaseClient.js';
import {
  PREMIUM_FEATURES, PREMIUM_PRICE_LABEL, PREMIUM_PRICE_VALUE, PREMIUM_PITCH,
  TIP_PITCH, TIP_PRICE_LABEL, TIP_PRICE_VALUE,
  startCheckout, startTipCheckout, openBillingPortal, isAdFree, isTipper,
  reviewCapFor, reviewsRemaining, markReviewUsed,
} from './billing.js';
import { rewardedAdsEnabled, showRewardedAd } from '../ads/adService.js';
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
  onReplayGame = () => {}, // free: replay moves + explore variations, no engine
  onReviewGame = () => {}, // premium: open the game review modal for a saved game
  onShareGame = () => {}, // create/copy a public replay link
  onAccountCreated = () => {}, // triggered after successful sign up
  onOpenAdminStats = () => {}, // admin: open the site stats dashboard
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [signupUsername, setSignupUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'info'|'error', text }
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [games, setGames] = useState([]);
  const [sharingGameId, setSharingGameId] = useState(null);
  const [reviewingGameId, setReviewingGameId] = useState(null);
  const [, setReviewQuotaVersion] = useState(0);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [taglineDraft, setTaglineDraft] = useState('');
  const avatarInputRef = useRef(null);
  const upsellViewedRef = useRef(false);

  const { authEnabled, user, profile, refreshProfile, signIn, signUp, signOut, resetPassword, updatePassword, recoveryMode } = auth;
  const isPaid = Boolean(profile && profile.tier === 'paid');
  const accountTierLabel = isPaid ? 'Premium' : isTipper(profile) ? 'Supporter' : 'Free';
  const accountTierClass = isPaid
    ? 'qc-am-tier-badge-paid'
    : isTipper(profile) ? 'qc-am-tier-badge-supporter' : 'qc-am-tier-badge-free';
  const rewardedReviewsActive = rewardedAdsEnabled();

  useEffect(() => {
    setPasswordVisible(false);
  }, [recoveryMode, open]);

  const selectAuthMode = (mode) => {
    setPasswordVisible(false);
    setAuthMode(mode);
    setNotice(null);
  };

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
          text: 'Thank you for the tip! ♥ Supporter bots and ad-free play are active for the next three months.',
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
        // Its own page, not a one-line notice: people missed that signup
        // isn't finished until the emailed link is clicked.
        setNotice(null);
        selectAuthMode('confirm-sent');
      }
      trackProductEvent(PRODUCT_EVENT.ACCOUNT_CREATED, { method: 'email' });
      // The parent must NOT tear this modal down while the confirm-sent
      // page is what tells the user to go click the email link.
      onAccountCreated(needsConfirmation);
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
      zIndex={10001}
      ariaLabelledBy="qc-account-title"
      backdropClassName="qc-account-backdrop"
      panelClassName="qc-account-panel qc-am-panel"
      panelStyle={{}}
    >
        <div className="qc-am-header">
          <h2 id="qc-account-title" className="qc-am-title"><UserIcon size={20} color="#61dafb" /> {recoveryMode ? 'Reset Password' : user ? 'Your Account' : authMode === 'confirm-sent' ? 'One More Step' : authMode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
          <ModalCloseButton ariaLabel="Close account panel" className="qc-account-close" onClick={onClose} />
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
                autoComplete="new-password" autoFocus
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
                  <div className="qc-am-password-wrap">
                    <input
                      className="qc-account-password qc-am-input qc-am-password-input"
                      type={passwordVisible ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="qc-am-password-toggle"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      onMouseDown={(event) => event.preventDefault()}
                      aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                      aria-pressed={passwordVisible}
                      title={passwordVisible ? 'Hide password' : 'Show password'}
                    >
                      {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="button" className="qc-account-signin qc-am-primary-btn" disabled={busy} onClick={handleSignIn}>
                    {busy ? 'Working…' : 'Sign In'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('forgot')}>
                      Forgot Password?
                    </button>
                    <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signup')}>
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
                  <div className="qc-am-password-wrap">
                    <input
                      className="qc-account-password qc-am-input qc-am-password-input"
                      type={passwordVisible ? 'text' : 'password'} value={password}
                      onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="qc-am-password-toggle"
                      onClick={() => setPasswordVisible((visible) => !visible)}
                      onMouseDown={(event) => event.preventDefault()}
                      aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                      aria-pressed={passwordVisible}
                      title={passwordVisible ? 'Hide password' : 'Show password'}
                    >
                      {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                {notice ? <div className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="button" className="qc-account-signup qc-am-create-btn" disabled={busy} onClick={handleSignUp}>
                    {busy ? 'Working…' : 'Create Account'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signin')}>
                      Already have an account? Sign In
                    </button>
                  </div>
                </div>
              </>
            )}

            {authMode === 'confirm-sent' && (
              <div style={{ textAlign: 'center', padding: '10px 4px 4px' }}>
                <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }} aria-hidden="true">📬</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 18 }}>Check your email</h3>
                <p style={{ margin: '0 0 6px', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.55 }}>
                  We sent a confirmation link to
                  <br />
                  <strong style={{ fontSize: 14.5 }}>{email.trim()}</strong>
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>
                  Your account isn&rsquo;t active until you click it. The email comes
                  from noreply@quantumchess.ninja — check spam if it&rsquo;s not there
                  within a minute. The link brings you straight back here, signed in.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signin')}>
                    Back to Sign In
                  </button>
                </div>
              </div>
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
                    <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signin')}>
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
                <div style={{ marginTop: 8 }}><span className={accountTierClass}>{accountTierLabel}</span></div>
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
                      ? `You're a Supporter until ${new Date(profile.ad_free_until).toLocaleDateString()}: no ads, 5 engine reviews a day, and 3 Supporter bots. Thank you! ♥`
                      : TIP_PITCH}
                  </span>
                  <button
                    type="button" className="qc-account-tip qc-am-ghost-btn"
                    style={{ borderColor: 'rgba(246,196,69,0.3)', color: '#f6c445' }}
                    disabled={busy} onClick={handleTip}
                    title="One-time payment — no ads for three months (tips stack)"
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
                Saved Games ({isPaid ? `${games.length} of 1,000` : `${games.length} of last 10`})
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
                      <span className="qc-am-game-actions">
                        <button
                          type="button"
                          className="qc-account-replay-game qc-am-review-btn standard"
                          title="Replay this game and explore variations"
                          onClick={() => onReplayGame(g)}
                        >
                          Replay
                        </button>
                        <button
                          type="button"
                          className="qc-account-share-game qc-am-review-btn standard"
                          title="Share a public replay link"
                          disabled={sharingGameId === g.id}
                          onClick={async () => {
                            setSharingGameId(g.id);
                            const result = await onShareGame(g);
                            setSharingGameId(null);
                            if (result?.error) setNotice({ kind: 'error', text: result.error });
                            else if (result?.copied) setNotice({ kind: 'info', text: 'Replay link copied!' });
                            else if (result?.shared) setNotice({ kind: 'info', text: 'Replay link shared!' });
                          }}
                        >
                          {sharingGameId === g.id ? '…' : 'Share'}
                        </button>
                        <button
                          type="button"
                          className={`qc-account-review-game qc-am-review-btn ${isPaid || isTipper(profile) ? 'premium' : 'standard'}`}
                          title={isPaid
                            ? 'Unlimited engine game reviews'
                            : `${reviewsRemaining(profile, user.id)} engine reviews left today${isTipper(profile) || !rewardedReviewsActive ? '' : ' · rewarded ad required'}`}
                          disabled={reviewingGameId !== null}
                          onClick={async () => {
                            const cap = reviewCapFor(profile);
                            const remaining = reviewsRemaining(profile, user.id);
                            if (remaining === 0) {
                              setNotice({ kind: 'info', text: `You've used today's ${cap} reviews — more tomorrow, or go Premium for unlimited.` });
                              return;
                            }
                            setReviewingGameId(g.id);
                            try {
                              if (!isPaid && !isTipper(profile) && rewardedReviewsActive) {
                                const rewarded = await showRewardedAd();
                                if (!rewarded) {
                                  setNotice({ kind: 'info', text: 'No review ad is available right now. Please try again in a moment.' });
                                  return;
                                }
                              }
                              const opened = await onReviewGame(g);
                              if (opened !== false && !isPaid) {
                                markReviewUsed(user.id);
                                setReviewQuotaVersion((version) => version + 1);
                              }
                            } finally {
                              setReviewingGameId(null);
                            }
                          }}
                        >
                          {reviewingGameId === g.id
                            ? '…'
                            : isPaid || isTipper(profile) || reviewsRemaining(profile, user.id) === 0
                              ? 'Review'
                              : rewardedReviewsActive ? '▷ Review (watch ad)' : 'Review'}
                        </button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <span style={{ fontSize: 12.5, color: '#a8b2d1' }}>Logged in as <strong style={{color: '#fff'}}>{user.email}</strong></span>
              <span style={{ display: 'flex', gap: 8 }}>
                {profile?.is_admin ? (
                  <button type="button" className="qc-account-admin-stats qc-am-ghost-btn" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onOpenAdminStats}>
                    Site Stats
                  </button>
                ) : null}
                <button type="button" className="qc-account-signout qc-am-ghost-btn" style={{ padding: '8px 14px', fontSize: 12 }} onClick={() => { signOut(); }}>
                  Sign Out
                </button>
              </span>
            </div>
          </>
        )}
    </ModalShell>
  );
}
