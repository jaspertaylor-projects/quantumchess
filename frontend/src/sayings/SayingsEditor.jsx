// frontend/src/sayings/SayingsEditor.jsx
// Purpose: The per-event sayings picker, shown as a Settings section for
// everyone. Each option is a character's line for that event — players pick
// from the roster they've unlocked, never free text. Signed-out picks
// persist in localStorage (via App); signed-in picks save to the profile.
// Imports From: ../theme.js, ./sayingsCatalog.js, ../account/supabaseClient.js
// Exported To: ../settings/SettingsModal.jsx

import React, { useEffect, useState } from 'react';
import theme from '../theme.js';
import { supabase } from '../account/supabaseClient.js';
import {
  SAYING_EVENTS, sayingOptionsForEvent, DEFAULT_SAYINGS, DEFAULT_CHARACTER_ID,
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
      // Old saves may hold retired preset ids or custom text — the select
      // can't show those, so they display as the default character.
      const options = sayingOptionsForEvent(ev.key, { isPaid });
      next[ev.key] = options.some((o) => o.id === value) ? value : DEFAULT_CHARACTER_ID;
    }
    setDraft(next);
    setNotice(null);
    // Re-init when identity changes (sign in/out), not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user && user.id]);

  const handleSave = async () => {
    const sayings = {};
    for (const ev of SAYING_EVENTS) {
      sayings[ev.key] = draft[ev.key] || DEFAULT_SAYINGS[ev.key];
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

  const renderOptions = (options) => {
    const starters = options.filter((o) => o.tier !== 'premium');
    const premium = options.filter((o) => o.tier === 'premium');
    return (
      <>
        <optgroup label="Starter roster">
          {starters.map((o) => (
            <option key={o.id} value={o.id}>{`${o.name}: “${o.text}”`}</option>
          ))}
        </optgroup>
        {premium.length > 0 ? (
          <optgroup label="★ Premium roster">
            {premium.map((o) => (
              <option key={o.id} value={o.id}>{`${o.name}: “${o.text}”`}</option>
            ))}
          </optgroup>
        ) : null}
      </>
    );
  };

  return (
    <div className="qc-sayings-editor" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 1.5 }}>
        Shown in a speech bubble on your player bar when it happens. Every line
        belongs to a character — unlock more characters, get more lines.
        {isPaid ? '' : ' ★ Premium unlocks the full roster.'}
      </div>
      {SAYING_EVENTS.map((ev) => {
        const options = sayingOptionsForEvent(ev.key, { isPaid });
        const value = draft[ev.key] || DEFAULT_CHARACTER_ID;
        return (
          <div key={ev.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11.5, color: theme.textSecondary, fontWeight: 700 }}>
              {ev.label}
            </label>
            <select
              className={`qc-saying-select-${ev.key}`}
              style={inputStyle}
              value={value}
              disabled={busy}
              onChange={(e) => setDraft((prev) => ({ ...prev, [ev.key]: e.target.value }))}
            >
              {renderOptions(options)}
              {!isPaid ? (
                <option value="__locked" disabled>
                  ★ 32 more characters with Premium
                </option>
              ) : null}
            </select>
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
