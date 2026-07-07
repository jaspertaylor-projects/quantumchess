// frontend/src/sayings/SayingsEditor.jsx
// Purpose: The per-event sayings picker, shown as a Settings section for
// everyone. Signed-out picks persist in localStorage (via App); signed-in
// picks save to the profile. Premium unlocks the full catalog + custom text.
// Imports From: ../theme.js, ./sayingsCatalog.js, ../account/supabaseClient.js
// Exported To: ../settings/SettingsModal.jsx

import React, { useEffect, useState } from 'react';
import theme from '../theme.js';
import { supabase } from '../account/supabaseClient.js';
import {
  SAYING_EVENTS, presetsForEvent, DEFAULT_SAYINGS, MAX_CUSTOM_SAYING_LENGTH,
} from './sayingsCatalog.js';

export default function SayingsEditor({ auth, localSayings = {}, onSaveLocalSayings = () => {} }) {
  const user = auth ? auth.user : null;
  const profile = auth ? auth.profile : null;
  const refreshProfile = auth ? auth.refreshProfile : () => {};
  const isPaid = Boolean(profile && profile.tier === 'paid');

  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'info'|'error', text }

  useEffect(() => {
    const saved = user ? ((profile && profile.sayings) || {}) : (localSayings || {});
    const next = {};
    for (const ev of SAYING_EVENTS) {
      const value = saved[ev.key] || DEFAULT_SAYINGS[ev.key];
      next[ev.key] = /^p\d{1,2}$/.test(value)
        ? { choice: value, custom: '' }
        : { choice: 'custom', custom: value };
    }
    setDraft(next);
    setNotice(null);
    // Re-init when identity changes (sign in/out), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);

  const handleSave = async () => {
    const sayings = {};
    for (const ev of SAYING_EVENTS) {
      const d = draft[ev.key];
      if (!d) continue;
      if (d.choice === 'custom') {
        const text = (d.custom || '').trim().slice(0, MAX_CUSTOM_SAYING_LENGTH);
        sayings[ev.key] = text || DEFAULT_SAYINGS[ev.key];
      } else {
        sayings[ev.key] = d.choice;
      }
    }
    if (!user) {
      onSaveLocalSayings(sayings);
      setNotice({ kind: 'info', text: 'Saved to this browser — sign up to keep them everywhere.' });
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.from('qc_profiles').update({ sayings }).eq('id', user.id);
    setBusy(false);
    if (error) setNotice({ kind: 'error', text: error.message });
    else {
      setNotice({ kind: 'info', text: 'Sayings saved.' });
      refreshProfile();
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8,
    border: `1px solid ${theme.border}`, background: 'rgba(255,255,255,0.05)',
    color: theme.textPrimary, fontSize: 13,
  };

  return (
    <div className="qc-sayings-editor" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
        Shown in a speech bubble on your player bar when it happens.
        {isPaid ? ' Premium: full catalog + write your own.' : ''}
      </div>
      {SAYING_EVENTS.map((ev) => {
        const d = draft[ev.key] || { choice: DEFAULT_SAYINGS[ev.key], custom: '' };
        const presets = presetsForEvent(ev.key, isPaid);
        return (
          <div key={ev.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11.5, color: theme.textSecondary, fontWeight: 700 }}>
              {ev.label}
            </label>
            <select
              className={`qc-saying-select-${ev.key}`}
              style={inputStyle}
              value={d.choice}
              disabled={busy}
              onChange={(e) => setDraft((prev) => ({ ...prev, [ev.key]: { ...d, choice: e.target.value } }))}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.text}</option>
              ))}
              {isPaid ? (
                <option value="custom">✏️ Write your own…</option>
              ) : (
                <option value={d.choice === 'custom' ? 'custom' : '__locked'} disabled>
                  ★ More options + custom with Premium
                </option>
              )}
            </select>
            {d.choice === 'custom' && isPaid ? (
              <input
                className={`qc-saying-custom-${ev.key}`}
                style={inputStyle}
                value={d.custom}
                maxLength={MAX_CUSTOM_SAYING_LENGTH}
                placeholder="Your saying…"
                onChange={(e) => setDraft((prev) => ({ ...prev, [ev.key]: { ...d, custom: e.target.value } }))}
              />
            ) : null}
          </div>
        );
      })}
      {notice ? (
        <div style={{
          fontSize: 12, lineHeight: 1.4, borderRadius: 8, padding: '6px 10px',
          background: notice.kind === 'error' ? 'rgba(255,59,48,0.12)' : 'rgba(79,195,247,0.10)',
          border: `1px solid ${notice.kind === 'error' ? 'rgba(255,59,48,0.5)' : 'rgba(79,195,247,0.45)'}`,
          color: theme.textPrimary,
        }}
        >
          {notice.text}
        </div>
      ) : null}
      <button
        type="button"
        className="qc-sayings-save"
        style={{
          padding: '8px 14px', borderRadius: 8, border: `1px solid ${theme.border}`,
          background: 'transparent', color: theme.textPrimary, fontWeight: 700,
          fontSize: 13, cursor: 'pointer', alignSelf: 'flex-start',
        }}
        disabled={busy}
        onClick={handleSave}
      >
        {busy ? 'Saving…' : 'Save Sayings'}
      </button>
    </div>
  );
}
