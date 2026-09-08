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
import {
  ChevronDown, Eye, EyeOff, Image as ImageIcon, Link2, MessageCircle,
  Share2, User as UserIcon, Sparkles as SparklesIcon, Video,
} from 'lucide-react';
import { fetchMyGames } from './gameSync.js';
import { supabase } from './supabaseClient.js';
import {
  PREMIUM_FEATURES, PREMIUM_PRICE_LABEL, PREMIUM_PRICE_VALUE, PREMIUM_PITCH,
  startCheckout,
} from './billing.js';
import {
  taglineOptions, sayingOptionsForEvent, SAYING_EVENTS,
  DEFAULT_SAYINGS, DEFAULT_CHARACTER_ID,
} from '../sayings/sayingsCatalog.js';
import { unlockedCharacters } from '../characters/characterCatalog.js';
import { PRODUCT_EVENT, trackProductEvent } from '../analytics/productEvents.js';
import { getBotById } from '../ai/bots.js';
import { loadDevSavedGames } from '../dev/devSavedGames.js';
import './AccountModal.css';

const PROFILE_REACTION_LABELS = {
  win: 'Win',
  loss: 'Loss',
  draw: 'Draw',
  capture: 'Capture',
  collapse: 'Full collapse',
};

export default function AccountModal({
  open = false,
  page = false,
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
  const [resendAt, setResendAt] = useState(0);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup' | 'forgot'
  const [games, setGames] = useState([]);
  const [sharingGameId, setSharingGameId] = useState(null);
  const [shareMenuGameId, setShareMenuGameId] = useState(null);
  const [reviewingGameId, setReviewingGameId] = useState(null);
  const [taglineDraft, setTaglineDraft] = useState('');
  const [sayingsDraft, setSayingsDraft] = useState({});
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [sayingsEditorOpen, setSayingsEditorOpen] = useState(false);
  const upsellViewedRef = useRef(false);

  const { authEnabled, user, profile, refreshProfile, signIn, signUp, signOut, resetPassword, updatePassword, recoveryMode } = auth;
  const isPaid = Boolean(profile && profile.tier === 'paid');
  // Unlocking a character unlocks all of its lines AND its avatar image; every
  // picker below draws from this one set so only unlocked items ever show.
  const unlockedIds = Array.isArray(profile?.unlocked_characters) ? profile.unlocked_characters : [];
  const avatarRoster = unlockedCharacters({ isPaid, unlockedIds }).filter((c) => c.image);
  const isProfilePage = Boolean(page && user);
  const recentWins = games.filter((game) => game.result === 'win').length;
  const recentLosses = games.filter((game) => game.result === 'loss').length;
  const recentDraws = games.filter((game) => game.result === 'draw').length;

  useEffect(() => {
    if (!open || !page) return undefined;
    const previousTitle = document.title;
    document.title = user
      ? `${profile?.username || 'Player'} — Quantum Chess Profile`
      : 'Sign In — Quantum Chess';
    return () => { document.title = previousTitle; };
  }, [open, page, user, profile?.username]);

  useEffect(() => {
    setPasswordVisible(false);
  }, [recoveryMode, open]);

  useEffect(() => {
    if (!open) {
      setShareMenuGameId(null);
      setAvatarPickerOpen(false);
      setSayingsEditorOpen(false);
      return undefined;
    }
    if (!shareMenuGameId) return undefined;
    const closeOnOutsidePress = (event) => {
      const menuRow = event.target.closest?.('[data-qc-share-menu]');
      if (menuRow?.dataset?.qcShareMenu !== String(shareMenuGameId)) {
        setShareMenuGameId(null);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setShareMenuGameId(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open, shareMenuGameId]);

  useEffect(() => {
    if (open && upsellSource === 'signup') setAuthMode((mode) => mode === 'confirm-sent' ? mode : 'signup');
  }, [open, upsellSource]);

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
            : 'Confirming your purchase. Your Premium unlock will appear here once payment is verified.',
        });
      } else if (billingReturn === 'cancelled') {
        setNotice({ kind: 'info', text: 'Checkout cancelled — nothing was charged.' });
      } else {
        setNotice(null);
      }
      setBusy(false);
      setTaglineDraft(profile && profile.tagline ? profile.tagline : '');
      // Seed each event's pick, falling back to the default character when the
      // saved value points at something no longer unlocked (or legacy text).
      const savedSayings = (profile && profile.sayings) || {};
      const nextSayings = {};
      for (const ev of SAYING_EVENTS) {
        const value = savedSayings[ev.key] || DEFAULT_SAYINGS[ev.key];
        const options = sayingOptionsForEvent(ev.key, { isPaid, unlockedIds });
        nextSayings[ev.key] = options.some((o) => o.id === value) ? value : DEFAULT_CHARACTER_ID;
      }
      setSayingsDraft(nextSayings);
      if (
        user
        && auth.isDevPreview
        && (auth.devPreviewLevel === 'premium' || auth.devPreviewLevel === 'admin')
      ) loadDevSavedGames().then(setGames);
      else if (user && !auth.isDevPreview) fetchMyGames(user).then(setGames);
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

  const shareGameLink = async (game) => {
    setSharingGameId(game.id);
    const result = await onShareGame(game, { delivery: 'copy' });
    setSharingGameId(null);
    if (result?.error) setNotice({ kind: 'error', text: result.error });
    else if (result?.copied) setNotice({ kind: 'info', text: 'Replay link copied!' });
    else if (result?.shared) setNotice({ kind: 'info', text: 'Replay link shared!' });
    if (!result?.cancelled) setShareMenuGameId(null);
  };

  if (!open) return null;

  const handleSignIn = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const { error } = await signIn(email.trim(), password).catch(() => ({ error: { message: 'Could not connect. Check your connection and try again.' } }));
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
  };

  const handleSignUp = async () => {
    if (busy) return;
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
    const { error, needsConfirmation } = await signUp(email.trim(), password, name).catch(() => ({ error: { message: 'Could not connect. Check your connection and try again.' } }));
    setBusy(false);
    if (error) {
      setNotice({ kind: 'error', text: error.message });
    } else {
      if (needsConfirmation) {
        // Its own page, not a one-line notice: people missed that signup
        // isn't finished until the emailed link is clicked.
        setNotice(null);
        setPassword('');
        setResendAt(Date.now() + 60_000);
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
    const { error } = await resetPassword(email.trim()).catch(() => ({ error: { message: 'Could not connect. Check your connection and try again.' } }));
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
    const { error } = await updatePassword(password).catch(() => ({ error: { message: 'Could not connect. Check your connection and try again.' } }));
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else setNotice({ kind: 'info', text: 'Password successfully updated.' });
  };

  // Checkout redirects away from the app on success; busy stays on until then.
  const handleUpgrade = async () => {
    if (blockDevPreviewAction()) return;
    trackProductEvent(PRODUCT_EVENT.PREMIUM_UPSELL_CLICKED, {
      source: upsellSource,
      offer: 'lifetime',
    });
    setBusy(true);
    setNotice(null);
    const { url, error } = await startCheckout();
    if (url) {
      trackProductEvent(PRODUCT_EVENT.CHECKOUT_STARTED, {
        source: upsellSource,
        offer: 'lifetime',
        value: PREMIUM_PRICE_VALUE,
      });
      window.location.assign(url);
      return;
    }
    setBusy(false);
    setNotice({ kind: 'error', text: error || 'Could not start checkout.' });
  };

  // Taglines are picked from the character roster, never typed — the draft
  // must be one of the unlocked characters' taglines (or empty to clear).
  const handleSaveTagline = async () => {
    if (blockDevPreviewAction()) return;
    if (!supabase || !user) return;
    const options = taglineOptions({ isPaid, unlockedIds });
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

  // Avatars are catalog-only. Custom file uploads are intentionally not
  // exposed from the profile so every public identity uses a vetted image.
  const handlePickAvatar = async (imageUrl) => {
    if (blockDevPreviewAction()) return;
    if (!supabase || !user) return;
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.from('qc_profiles').update({ avatar_url: imageUrl }).eq('id', user.id);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else {
      setNotice({ kind: 'info', text: 'Avatar updated.' });
      setAvatarPickerOpen(false);
      refreshProfile();
    }
  };

  const handleSaveSayings = async () => {
    if (blockDevPreviewAction()) return;
    if (!supabase || !user) return;
    const sayings = {};
    for (const ev of SAYING_EVENTS) sayings[ev.key] = sayingsDraft[ev.key] || DEFAULT_SAYINGS[ev.key];
    setBusy(true);
    const { error } = await supabase.from('qc_profiles').update({ sayings }).eq('id', user.id);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else {
      setNotice({ kind: 'info', text: 'Game reactions saved.' });
      setSayingsEditorOpen(false);
      refreshProfile();
    }
  };

  return (
    <>
      <ModalShell
      onClose={onClose}
      closeOnBackdrop={!page}
      zIndex={10001}
      role={isProfilePage ? 'main' : 'dialog'}
      ariaModal={!isProfilePage}
      ariaLabelledBy="qc-account-title"
      backdropClassName={`qc-account-backdrop${isProfilePage ? ' qc-account-backdrop--page' : ''}`}
      panelClassName={`qc-account-panel qc-am-panel${isProfilePage ? ' qc-am-panel--profile-page' : ''}`}
      panelStyle={{}}
    >
        <div className="qc-am-header">
          {user && !recoveryMode ? (
            <>
              <div className="qc-am-header-identity">
                <div className="qc-am-header-avatar" aria-hidden>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    <span>{(profile?.username?.[0] || user?.email?.[0] || '?').toUpperCase()}</span>
                  )}
                </div>
                <h2 id="qc-account-title" className="qc-am-title qc-am-header-name">{profile?.username || 'Quantum Player'}</h2>
              </div>
              <div className="qc-am-header-actions">
                <button type="button" className="qc-account-signout qc-am-ghost-btn qc-am-header-btn" onClick={() => { signOut(); }}>
                  Sign Out
                </button>
                <ModalCloseButton ariaLabel={isProfilePage ? 'Back to game' : 'Close account panel'} className="qc-account-close" onClick={onClose} />
              </div>
            </>
          ) : (
            <>
              <h2 id="qc-account-title" className="qc-am-title"><UserIcon size={20} color="#61dafb" /> {recoveryMode ? 'Reset Password' : authMode === 'confirm-sent' ? 'One More Step' : authMode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
              <ModalCloseButton ariaLabel={isProfilePage ? 'Back to game' : 'Close account panel'} className="qc-account-close" onClick={onClose} />
            </>
          )}
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
            {notice ? <div role="status" aria-live="polite" className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button type="button" className="qc-account-signin qc-am-primary-btn" style={{flex: 1}} disabled={busy} onClick={handleUpdatePassword}>
                {busy ? 'Working…' : 'Set New Password'}
              </button>
            </div>
          </>
        ) : !user ? (
          <>
            {authMode === 'signin' && (
              <form className="qc-am-auth-form" onSubmit={(event) => { event.preventDefault(); if (!busy) handleSignIn(); }}>
                <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Sign in to continue. Accounts are optional but keep your rating and history safe.
                </p>
                <div>
                  <div className="qc-am-label">Email</div>
                  <input
                    className="qc-account-email qc-am-input" type="email" name="email" aria-label="Email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  />
                </div>
                <div>
                  <div className="qc-am-label">Password</div>
                  <div className="qc-am-password-wrap">
                    <input
                      className="qc-account-password qc-am-input qc-am-password-input"
                      aria-label="Password" required minLength={1} name="password" type={passwordVisible ? 'text' : 'password'} value={password}
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
                {notice ? <div role="status" aria-live="polite" className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="submit" className="qc-account-signin qc-am-primary-btn" disabled={busy}>
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
              </form>
            )}

            {authMode === 'signup' && (
              <form className="qc-am-auth-form" onSubmit={(event) => { event.preventDefault(); if (!busy) handleSignUp(); }}>
                <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Save your games, track your rating, and unlock opponents. Free to join.
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
                    placeholder="3–20 letters, numbers, _ or -"
                    required minLength={3} pattern="[A-Za-z0-9_-]{3,20}" aria-label="Username" name="qc-display-name" autoComplete="nickname"
                  />
                </div>
                <div>
                  <div className="qc-am-label">Email</div>
                  <input
                    className="qc-account-email qc-am-input" type="email" name="email" aria-label="Email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  />
                </div>
                <div>
                  <div className="qc-am-label">Password · at least 6 characters</div>
                  <div className="qc-am-password-wrap">
                    <input
                      className="qc-account-password qc-am-input qc-am-password-input"
                      aria-label="Password" required minLength={6} name="password" type={passwordVisible ? 'text' : 'password'} value={password}
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
                {notice ? <div role="status" aria-live="polite" className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="submit" className="qc-account-signup qc-am-create-btn" disabled={busy}>
                    {busy ? 'Working…' : 'Create Account'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signin')}>
                      Already have an account? Sign In
                    </button>
                  </div>
                </div>
              </form>
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
                {notice ? <div role="status" className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <button type="button" className="qc-am-link-ghost" disabled={busy} onClick={async () => {
                  if (Date.now() < resendAt) { setNotice({ kind: 'info', text: 'Please wait one minute before requesting another email.' }); return; }
                  setBusy(true);
                  try {
                    const { error } = await auth.resendConfirmation(email);
                    setNotice({ kind: error ? 'error' : 'info', text: error ? error.message : 'Confirmation email sent. Check your inbox and spam folder.' });
                    setResendAt(Date.now() + 60_000);
                  } catch (_) { setNotice({ kind: 'error', text: 'Could not send the email. Please try again.' }); }
                  finally { setBusy(false); }
                }}>{busy ? 'Sending…' : 'Resend confirmation email'}</button>
                <button type="button" className="qc-am-link-ghost" disabled={busy} onClick={() => selectAuthMode('signup')}>Change email</button>
                <button type="button" className="qc-am-primary-btn" onClick={onClose}>Keep playing while you wait</button>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signin')}>
                    Back to Sign In
                  </button>
                </div>
              </div>
            )}

            {authMode === 'forgot' && (
              <form className="qc-am-auth-form" onSubmit={(event) => { event.preventDefault(); if (!busy) handleResetPassword(); }}>
                <p style={{ margin: '0 0 16px 0', fontSize: 13.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                  Enter your email address and we'll send you a link to reset your password.
                </p>
                <div>
                  <div className="qc-am-label">Email</div>
                  <input
                    className="qc-account-email qc-am-input" type="email" name="email" aria-label="Email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  />
                </div>
                {notice ? <div role="status" aria-live="polite" className={`qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}
                <div style={{ display: 'flex', gap: 12, marginTop: 4, flexDirection: 'column' }}>
                  <button type="submit" className="qc-account-signin qc-am-primary-btn" disabled={busy}>
                    {busy ? 'Working…' : 'Send Reset Link'}
                  </button>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                    <button type="button" className="qc-am-link-ghost" onClick={() => selectAuthMode('signin')}>
                      Back to Sign In
                    </button>
                  </div>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="qc-profile-content">
            <section className="qc-profile-hero">
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
                <div className="qc-am-stat-label">Recent Record</div>
                <div className="qc-am-stat-value qc-am-stat-value--record">
                  <span className="is-win">{recentWins}W</span>
                  <span className="is-loss">{recentLosses}L</span>
                  <span>{recentDraws}D</span>
                </div>
              </div>
              <div className="qc-am-stat">
                <div className="qc-am-stat-label">Saved Games</div>
                <div className="qc-am-stat-value">{games.length}</div>
              </div>
              </div>
            </section>

            <section className="qc-profile-card qc-profile-editor">
              <h3 className="qc-profile-section-title">Player style</h3>

              <div className="qc-profile-identity-row">
                <div className="qc-avatar-current" aria-hidden>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    <span>{(profile?.username?.[0] || '?').toUpperCase()}</span>
                  )}
                </div>
                <div className="qc-profile-identity-copy">
                  <strong>{profile?.username || 'Quantum Player'}</strong>
                  <span>Player name</span>
                </div>
                <button
                  type="button"
                  className="qc-account-choose-avatar qc-am-ghost-btn qc-am-header-btn"
                  disabled={busy}
                  onClick={() => setAvatarPickerOpen(true)}
                >
                  <ImageIcon size={15} />
                  Choose avatar
                </button>
              </div>

              <div className="qc-profile-setting-row">
                <div className="qc-profile-setting-heading">
                  <span>Tagline</span>
                  {!isPaid ? <small>Premium</small> : null}
                </div>
                {isPaid ? (
                  <div className="qc-profile-tagline-control">
                    <select
                      className="qc-account-tagline qc-am-input"
                      value={taglineDraft}
                      onChange={(e) => setTaglineDraft(e.target.value)}
                      aria-label="Pick a tagline from your characters"
                    >
                      <option value="">No tagline</option>
                      {taglineOptions({ isPaid, unlockedIds }).map((o) => (
                        <option key={o.id} value={o.tagline}>{o.tagline}</option>
                      ))}
                    </select>
                    <button type="button" className="qc-am-ghost-btn" disabled={busy} onClick={handleSaveTagline}>
                      Save
                    </button>
                  </div>
                ) : (
                  <span className="qc-profile-setting-value">No tagline selected</span>
                )}
              </div>

              <div className="qc-profile-setting-row qc-profile-reactions-row">
                <div className="qc-profile-setting-heading">
                  <span>Game reactions</span>
                  <small>{SAYING_EVENTS.length} moments</small>
                </div>
                <button
                  type="button"
                  className="qc-account-edit-reactions qc-am-ghost-btn qc-am-header-btn"
                  disabled={busy}
                  onClick={() => setSayingsEditorOpen(true)}
                >
                  <MessageCircle size={15} />
                  Customize
                </button>
              </div>
            </section>

            {notice ? <div className={`qc-profile-notice qc-am-notice-${notice.kind}`}>{notice.text}</div> : null}

            {isPaid ? (
              <div className="qc-profile-membership qc-am-premium-card" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <div className="qc-am-premium-title"><SparklesIcon size={18} /> Premium unlocked · no further payments</div>
              </div>
            ) : (
              <div className="qc-profile-membership qc-account-premium qc-am-premium-card">
                <div className="qc-am-premium-title"><SparklesIcon size={18} /> Go Premium · {PREMIUM_PRICE_LABEL}</div>
                <div style={{ fontSize: 13.5, color: '#fff', lineHeight: 1.55 }}>
                  {PREMIUM_PITCH}
                </div>
                <ul className="qc-am-feature-list">
                  {PREMIUM_FEATURES.map((f) => (
                    <li key={f} className="qc-am-feature-item"><span style={{ color: '#f6c445' }}>✦</span> {f}</li>
                  ))}
                </ul>
                <button
                  type="button" className="qc-account-upgrade qc-am-gold-btn"
                  disabled={busy} onClick={handleUpgrade}
                  style={{ marginTop: 4 }}
                >
                  {busy ? 'Working…' : `Upgrade — ${PREMIUM_PRICE_LABEL}`}
                </button>
                <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.5)' }}>
                  One payment of $10 unlocks Premium permanently on your account. No renewals. Secure payment via Stripe.{' '}
                  <a href="/terms.html" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms</a>
                  {' · '}
                  <a href="/terms.html#refunds" target="_blank" rel="noopener" style={{ color: 'inherit', textDecoration: 'underline' }}>Refund policy</a>
                </div>
              </div>
            )}

            <section className="qc-profile-card qc-profile-games">
              <h3 className="qc-profile-section-title">Game history</h3>
              <div className="qc-am-label">
                Saved Games ({isPaid ? `${games.length} of 1,000` : `${games.length} of last 10`})
              </div>
              <div className="qc-profile-games-list">
                {games.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#a8b2d1', fontStyle: 'italic' }}>Finished games will appear here.</div>
                ) : (
                  games.map((g) => (
                    <div
                      key={g.id}
                      className="qc-account-game-row qc-am-game-row"
                      data-qc-share-menu={shareMenuGameId === g.id ? String(g.id) : undefined}
                    >
                      <span className={`qc-am-result-${g.result}`}>{g.result}</span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>
                        vs {getBotById(g.opponent)?.name || g.opponent}{g.opponent_rating ? ` (${g.opponent_rating})` : ''} <span style={{color: '#a8b2d1'}}>· {g.user_side}</span>
                      </span>
                      <span style={{ color: '#a8b2d1', fontWeight: 600 }}>
                        {g.rating_after ? `${g.rating_before}→${g.rating_after}` : 'unrated'}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11.5 }}>{new Date(g.created_at).toLocaleDateString()}</span>
                      <span className="qc-am-game-actions">
                        <button
                          type="button"
                          className="qc-account-replay-game qc-am-review-btn standard"
                          title="View this game and explore variations"
                          onClick={() => onReplayGame(g)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="qc-account-share-game qc-am-review-btn standard qc-am-share-trigger"
                          title="Share this game"
                          aria-expanded={shareMenuGameId === g.id}
                          onClick={() => setShareMenuGameId((current) => (current === g.id ? null : g.id))}
                        >
                          <Share2 size={13} />
                          Share
                          <ChevronDown
                            className="qc-am-share-trigger-chevron"
                            size={13}
                            aria-hidden="true"
                            style={{ transform: shareMenuGameId === g.id ? 'rotate(180deg)' : 'none' }}
                          />
                        </button>
                        <button
                          type="button"
                          className={`qc-account-review-game qc-am-review-btn ${isPaid ? 'premium' : 'standard'}`}
                          title={isPaid ? 'Unlimited engine game reviews' : 'Unlock game review with Premium — $10 once'}
                          disabled={reviewingGameId !== null}
                          onClick={async () => {
                            if (!isPaid) { await handleUpgrade(); return; }
                            setReviewingGameId(g.id);
                            try { await onReviewGame(g); }
                            finally { setReviewingGameId(null); }
                          }}
                        >
                          {reviewingGameId === g.id ? '…' : isPaid ? 'Review' : 'Unlock review · $10 once'}
                        </button>
                      </span>
                      {shareMenuGameId === g.id ? (
                        <div className="qc-am-share-menu" role="menu" aria-label="Share game options">
                          <button
                            type="button"
                            className="qc-am-share-choice"
                            role="menuitem"
                            disabled={sharingGameId === g.id}
                            onClick={() => shareGameLink(g)}
                          >
                            <span className="qc-am-share-choice-icon is-link"><Link2 size={18} /></span>
                            <span>
                              <strong>{sharingGameId === g.id ? 'Creating link…' : 'Share game link'}</strong>
                              <small>Send a link that opens this replay</small>
                            </span>
                          </button>
                          <button
                            type="button"
                            className="qc-am-share-choice"
                            role="menuitem"
                            onClick={() => {
                              setShareMenuGameId(null);
                              onReplayGame(g, { initialReplayAction: 'video' });
                            }}
                          >
                            <span className="qc-am-share-choice-icon is-video"><Video size={18} /></span>
                            <span>
                              <strong>Create replay clip</strong>
                              <small>Export the game as a social video</small>
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="qc-profile-card qc-profile-account-access">
              <h3 className="qc-profile-section-title">Account access</h3>
              <span className="qc-profile-account-email">Signed in as <strong>{user.email}</strong></span>
              {profile?.is_admin ? (
                <span style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="qc-account-admin-stats qc-am-ghost-btn" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onOpenAdminStats}>
                    Site Stats
                  </button>
                </span>
              ) : null}
            </section>
          </div>
        )}
      </ModalShell>

      {avatarPickerOpen ? (
          <ModalShell
            onClose={() => setAvatarPickerOpen(false)}
            closeOnBackdrop
            zIndex={10020}
            ariaLabelledBy="qc-avatar-picker-title"
            backdropClassName="qc-profile-picker-backdrop"
            panelClassName="qc-profile-picker-panel qc-avatar-picker-modal"
          >
            <div className="qc-profile-picker-header">
              <div>
                <h3 id="qc-avatar-picker-title">Choose your avatar</h3>
                <span>{avatarRoster.length} unlocked</span>
              </div>
              <ModalCloseButton ariaLabel="Close avatar picker" onClick={() => setAvatarPickerOpen(false)} />
            </div>
            <div className="qc-avatar-grid" role="group" aria-label="Available character avatars">
              {avatarRoster.map((character) => {
                const selected = profile?.avatar_url === character.image;
                return (
                  <button
                    key={character.id}
                    type="button"
                    className={`qc-avatar-choice${selected ? ' is-selected' : ''}`}
                    aria-pressed={selected}
                    disabled={busy}
                    onClick={() => handlePickAvatar(character.image)}
                  >
                    <img src={character.image} alt="" loading="lazy" />
                    <span>{character.name}</span>
                  </button>
                );
              })}
            </div>
          </ModalShell>
      ) : null}

      {sayingsEditorOpen ? (
          <ModalShell
            onClose={() => setSayingsEditorOpen(false)}
            closeOnBackdrop
            zIndex={10020}
            ariaLabelledBy="qc-reactions-picker-title"
            backdropClassName="qc-profile-picker-backdrop"
            panelClassName="qc-profile-picker-panel qc-reactions-picker-modal"
          >
            <div className="qc-profile-picker-header">
              <div>
                <h3 id="qc-reactions-picker-title">Game reactions</h3>
                <span>Choose a voice for each moment.</span>
              </div>
              <ModalCloseButton ariaLabel="Close game reactions" onClick={() => setSayingsEditorOpen(false)} />
            </div>
            <div className="qc-profile-sayings-grid">
              {SAYING_EVENTS.map((event) => {
                const options = sayingOptionsForEvent(event.key, { isPaid, unlockedIds });
                const value = sayingsDraft[event.key] || DEFAULT_CHARACTER_ID;
                return (
                  <label key={event.key} className="qc-profile-saying-row">
                    <span className="qc-profile-saying-label">
                      {PROFILE_REACTION_LABELS[event.key] || event.label}
                    </span>
                    <select
                      className={`qc-saying-select-${event.key} qc-am-input`}
                      value={value}
                      disabled={busy}
                      onChange={(e) => setSayingsDraft((previous) => ({
                        ...previous,
                        [event.key]: e.target.value,
                      }))}
                    >
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>{option.name}</option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            <div className="qc-profile-picker-footer">
              <button
                type="button"
                className="qc-sayings-save qc-am-primary-btn"
                disabled={busy}
                onClick={handleSaveSayings}
              >
                {busy ? 'Saving…' : 'Save reactions'}
              </button>
            </div>
          </ModalShell>
      ) : null}
    </>
  );
}
