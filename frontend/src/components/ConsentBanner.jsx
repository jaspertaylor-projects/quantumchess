// frontend/src/components/ConsentBanner.jsx
// Purpose: Cookie/ads consent banner. Shown once per browser until a choice
// is made; the choice is stored and fed to the ad service (Google Consent
// Mode v2 signals) so advertising respects it.
// Imports From: ../theme.js, ../ads/adService.js
// Exported To: ../App.jsx

import React, { useEffect, useState } from 'react';
import theme from '../theme.js';
import { setAdConsent } from '../ads/adService.js';

const STORAGE_KEY = 'qcConsent'; // 'granted' | 'denied'

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const prior = localStorage.getItem(STORAGE_KEY);
      if (prior === 'granted' || prior === 'denied') {
        setAdConsent(prior === 'granted');
      } else {
        setVisible(true);
      }
    } catch (_) {
      setVisible(true);
    }
  }, []);

  const choose = (granted) => {
    try {
      localStorage.setItem(STORAGE_KEY, granted ? 'granted' : 'denied');
    } catch (_) {
      // ignore storage errors
    }
    setAdConsent(granted);
    setVisible(false);
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
      padding: '9px 16px', borderRadius: 8, border: 'none',
      background: theme.primary, color: theme.secondary, fontWeight: 800, fontSize: 13, cursor: 'pointer',
    },
    reject: {
      padding: '9px 16px', borderRadius: 8, border: `1px solid ${theme.border}`,
      background: 'transparent', color: theme.textPrimary, fontWeight: 700, fontSize: 13, cursor: 'pointer',
    },
  };

  return (
    <div className="qc-consent-banner" style={styles.wrap} role="dialog" aria-label="Cookie consent">
      <div style={styles.panel}>
        <div style={styles.text}>
          We use cookies to keep the game free through advertising. Accept to allow personalized
          ads, or choose necessary-only. See our{' '}
          <a href="/privacy.html" style={styles.link}>Privacy Policy</a>.
        </div>
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
  );
}
