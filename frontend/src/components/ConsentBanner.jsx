// frontend/src/components/ConsentBanner.jsx
// Purpose: Cookie/ads consent banner. Shown once per browser until a choice
// is made; the choice is stored and fed to the ad service (Google Consent
// Mode v2 signals) so advertising respects it.
// Imports From: ../theme.js, ../ads/adService.js
// Exported To: ../welcome/WelcomeLanding.jsx, ../App.jsx (silent preference restore)

import React, { useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import theme from '../theme.js';
import { setAdConsent } from '../ads/adService.js';
import { setAnalyticsConsent } from '../analytics/analytics.js';

export const CONSENT_STORAGE_KEY = 'qcConsent';
export const CONSENT_CHOICE = Object.freeze({
  GRANTED: 'granted',
  DENIED: 'denied',
});

export function readStoredConsent(storage = null) {
  try {
    const source = storage || localStorage;
    const value = source.getItem(CONSENT_STORAGE_KEY);
    return value === CONSENT_CHOICE.GRANTED || value === CONSENT_CHOICE.DENIED
      ? value
      : null;
  } catch (_) {
    return null;
  }
}

export default function ConsentBanner({
  promptIfUnset = true,
  forceOpen = false,
  emphasizeChoices = false,
  onDecision = null,
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const prior = readStoredConsent();
    if (prior) {
      const granted = prior === CONSENT_CHOICE.GRANTED;
      setAdConsent(granted);
      setAnalyticsConsent(granted);
    } else if (promptIfUnset) {
      setVisible(true);
    }
  }, [promptIfUnset]);

  useEffect(() => {
    if (forceOpen) setVisible(true);
  }, [forceOpen]);

  const choose = (granted) => {
    const choice = granted ? CONSENT_CHOICE.GRANTED : CONSENT_CHOICE.DENIED;
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    } catch (_) {
      // ignore storage errors
    }
    setAdConsent(granted);
    setAnalyticsConsent(granted);
    setVisible(false);
    if (onDecision) onDecision(choice);
  };

  if (!visible) return null;

  const styles = {
    wrap: {
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1200,
      display: 'flex',
      justifyContent: 'center',
      padding: '12px 12px calc(12px + env(safe-area-inset-bottom, 0px))',
      pointerEvents: 'none',
    },
    panel: {
      pointerEvents: 'auto',
      width: 'min(96vw, 720px)',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 12,
      padding: '13px 16px',
      borderRadius: 12,
      background: 'rgba(12,15,24,0.98)',
      border: `1px solid ${theme.border}`,
      boxShadow: `0 10px 30px ${theme.shadow}`,
      color: theme.textPrimary,
    },
    text: { flex: '1 1 320px', fontSize: 13, lineHeight: 1.5, color: theme.textSecondary },
    link: { color: theme.primary, textDecoration: 'none', fontWeight: 700 },
    buttons: { display: 'flex', gap: 8, flex: '0 0 auto' },
    accept: {
      minWidth: 118, padding: '9px 16px', borderRadius: 8, border: `1px solid ${theme.primary}`,
      background: theme.primary, color: theme.secondary, fontWeight: 800, fontSize: 13, cursor: 'pointer',
    },
    reject: {
      minWidth: 118, padding: '9px 16px', borderRadius: 8, border: `1px solid ${theme.textSecondary}`,
      background: 'rgba(255,255,255,0.07)', color: theme.textPrimary, fontWeight: 800, fontSize: 13, cursor: 'pointer',
    },
  };

  return (
    <div className={`qc-consent-banner${emphasizeChoices ? ' qc-consent-banner--unlock' : ''}`} style={styles.wrap} role="dialog" aria-label="Cookie consent">
      <div className="qc-consent-panel" style={styles.panel}>
        <div style={styles.text}>
          We use optional cookies and similar technologies for analytics and personalized advertising.
          Accept all to allow them, or choose Necessary only to keep optional storage denied. Either
          choice unlocks play, and you can change it later under Privacy choices. See our{' '}
          <a href="/privacy.html" style={styles.link}>Privacy Policy</a>.
        </div>
        <div className={`qc-consent-actions${emphasizeChoices ? ' qc-consent-actions--unlock' : ''}`}>
          {emphasizeChoices ? (
            <div className="qc-consent-unlock-cue" aria-hidden="true">
              <span className="qc-consent-unlock-branch qc-consent-unlock-branch--left" />
              <span className="qc-consent-unlock-lock"><LockKeyhole size={15} /></span>
              <span className="qc-consent-unlock-branch qc-consent-unlock-branch--right" />
            </div>
          ) : null}
          <div style={styles.buttons}>
            <button type="button" className="qc-consent-reject" style={styles.reject} onClick={() => choose(false)}>
              Necessary only
            </button>
            <button type="button" className="qc-consent-accept" style={styles.accept} onClick={() => choose(true)}>
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
