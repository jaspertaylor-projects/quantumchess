// frontend/src/account/useAuth.js
// Purpose: Session + profile state for optional user accounts. Anonymous
// play always works; this hook is inert when Supabase isn't configured.
// Imports From: ./supabaseClient.js
// Exported To: ../App.jsx

import { useCallback, useEffect, useState } from 'react';
import { supabase, accountsEnabled } from './supabaseClient.js';

export default function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(() => {
    try { return new URLSearchParams(window.location.search).has('reset'); } catch (_) { return false; }
  });

  // The query marker is only a bootstrap hint; remove it once consumed so a
  // later ordinary reload does not reopen the completed reset flow. Preserve
  // Supabase's hash/code parameters while it establishes the recovery session.
  useEffect(() => {
    if (!recoveryMode) return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('reset')) return;
      url.searchParams.delete('reset');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch (_) { /* URL cleanup is cosmetic; recovery can continue */ }
  }, [recoveryMode]);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!supabase || !session || !session.user) {
      setProfile(null);
      return null;
    }
    const uid = session.user.id;
    let { data } = await supabase.from('qc_profiles').select('*').eq('id', uid).maybeSingle();
    if (!data) {
      // Backstop if the signup trigger didn't run (e.g., schema installed later).
      const meta = session.user.user_metadata || {};
      const username = meta.username || (session.user.email || 'player').split('@')[0];
      const ins = await supabase
        .from('qc_profiles')
        .insert({ id: uid, username })
        .select()
        .maybeSingle();
      data = ins.data || null;
    }
    setProfile(data);
    return data;
  }, [session]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { error: { message: 'Accounts are not configured.' } };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email, password, username) => {
    if (!supabase) return { error: { message: 'Accounts are not configured.' } };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // The confirmation link lands in the app, on THIS origin (prod or dev
      // — both are in the project's redirect allowlist; the remote site_url
      // fallback is quantumchess.ninja, never localhost:3000).
      options: { data: { username }, emailRedirectTo: `${window.location.origin}/play` },
    });
    // When email confirmation is on, a user is returned but no session.
    const needsConfirmation = Boolean(!error && data && data.user && !data.session);
    return { error, needsConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile(null);
    setRecoveryMode(false);
  }, []);

  const resetPassword = useCallback(async (email) => {
    if (!supabase) return { error: { message: 'Accounts are not configured.' } };
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Land directly on the game surface. The reset marker is also treated
      // as a deep link so older emails targeting /?reset=1 still bypass the
      // first-visit welcome screen.
      redirectTo: window.location.origin + '/play?reset=1'
    });
    return { error };
  }, []);

  const updatePassword = useCallback(async (newPassword) => {
    if (!supabase) return { error: { message: 'Accounts are not configured.' } };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setRecoveryMode(false);
    return { error };
  }, []);

  const resendConfirmation = useCallback(async (email) => {
    if (!supabase) return { error: { message: 'Accounts are not configured.' } };
    return supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/play` } });
  }, []);

  return {
    resendConfirmation,
    authEnabled: accountsEnabled(),
    session,
    user: session ? session.user : null,
    profile,
    refreshProfile,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    recoveryMode,
  };
}
