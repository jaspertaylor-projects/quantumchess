// frontend/src/account/AccountModal.jsx
// Purpose: Sign in / sign up and, once signed in, the player's profile:
// username, tier badge, rating, and recent saved games.
// Imports From: ../theme.js, ../components/IconButton.jsx, ./gameSync.js, ./supabaseClient.js
// Exported To: ../App.jsx

import React, { useEffect, useState } from 'react';
import theme from '../theme.js';
import IconButton from '../components/IconButton.jsx';
import { X as XIcon, User as UserIcon } from 'lucide-react';
import { fetchMyGames } from './gameSync.js';
import { supabase } from './supabaseClient.js';

export default function AccountModal({
  open = false,
  onClose = () => {},
  auth, // the useAuth() bundle from App
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'info'|'error', text }
  const [games, setGames] = useState([]);
  const [usernameDraft, setUsernameDraft] = useState('');

  const { authEnabled, user, profile, refreshProfile, signIn, signUp, signOut } = auth;

  useEffect(() => {
    if (open) {
      setNotice(null);
      setBusy(false);
      setUsernameDraft(profile && profile.username ? profile.username : '');
      if (user) fetchMyGames(user).then(setGames);
      else setGames([]);
    }
  }, [open, user, profile]);

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

  const gamesCap = profile && profile.tier === 'paid' ? 1000 : 10;

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

            {notice ? <div style={styles.notice(notice.kind)}>{notice.text}</div> : null}

            <div>
              <div style={{ ...styles.label, marginBottom: 6 }}>
                Saved Games ({games.length} of last {gamesCap})
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
