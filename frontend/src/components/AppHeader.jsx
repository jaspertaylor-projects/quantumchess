// frontend/src/components/AppHeader.jsx
// Purpose: Desktop banner — the glowing wordmark plus the persistent
// top-right controls: settings gear and the account chip (Sign In pill when
// signed out, avatar + username when signed in).
// Imports From: None
// Exported To: ../App.jsx

import React from 'react';
import { User as UserIcon, Settings as SettingsIcon } from 'lucide-react';

export default function AppHeader({
  accountSignedIn = false,
  accountName = '',
  accountAvatarUrl = null,
  onOpenAccount = () => {},
  onOpenSettings = () => {},
}) {
  const TITLE_SIZE_CSS = 'clamp(1.6rem, 5vw, 3.2rem)';

  const styles = {
    appHeader: {
      position: 'relative',
      backgroundColor: '#000',
      padding: '0 clamp(8px, 1.5vw, 16px)',
      textAlign: 'center',
      width: '100%',
      boxSizing: 'border-box',
      userSelect: 'none',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      ['--qc-title-size']: TITLE_SIZE_CSS,
      height: 'calc(var(--qc-title-size) * 1.5)',
      minHeight: 'calc(var(--qc-title-size) * 1.5)',
      maxHeight: 'calc(var(--qc-title-size) * 1.5)',
      flex: '0 0 auto',
    },
    appTitleText: {
      margin: 0,
      fontSize: 'var(--qc-title-size)',
      fontWeight: 1000,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      backgroundImage:
        'linear-gradient(90deg, #00f5ff 0%, #b400ff 38%, #ff3b7f 64%, #00f5ff 100%)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      textShadow: [
        '0 0 6px rgba(0,245,255,0.45)',
        '0 0 12px rgba(180,0,255,0.35)',
        '0 0 22px rgba(255,59,127,0.35)',
      ].join(', '),
      lineHeight: 1,
      display: 'inline-block',
      whiteSpace: 'nowrap',
    },
    appTitleUnderline: {
      marginTop: '4px',
      height: '3px',
      width: '100%',
      background:
        'linear-gradient(90deg, rgba(0,245,255,0) 0%, rgba(0,245,255,0.8) 16%, rgba(180,0,255,0.95) 50%, rgba(255,59,127,0.8) 84%, rgba(255,59,127,0) 100%)',
      borderRadius: 3,
      boxShadow: '0 0 18px rgba(180,0,255,0.45), 0 0 28px rgba(0,245,255,0.25)',
      alignSelf: 'center',
      flex: '0 0 auto',
    },
    topRight: {
      position: 'absolute',
      right: 'clamp(10px, 1.5vw, 20px)',
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 5,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    },
    gearBtn: {
      display: 'grid',
      placeItems: 'center',
      width: 36,
      height: 36,
      border: 'none',
      background: 'transparent',
      color: '#93a1b5',
      cursor: 'pointer',
      padding: 0,
    },
  };

  return (
    <header className="qc-app-header" style={styles.appHeader}>
      <h1 className="qc-app-title-text" style={styles.appTitleText}>
        Quantum Chess
      </h1>
      <div className="qc-app-title-underline" style={styles.appTitleUnderline} />
      <div className="qc-header-controls" style={styles.topRight}>
        <button
          type="button"
          className="qc-header-settings"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          style={styles.gearBtn}
        >
          <SettingsIcon size={20} />
        </button>
        <button
          type="button"
          className="qc-header-account"
          onClick={onOpenAccount}
          aria-label={accountSignedIn ? 'Open account panel' : 'Sign in'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: accountSignedIn ? '4px 12px 4px 4px' : '8px 16px',
            borderRadius: 999,
            border: accountSignedIn ? '1px solid rgba(79,195,247,0.45)' : 'none',
            background: accountSignedIn ? 'rgba(12,14,22,0.85)' : '#4fc3f7',
            color: accountSignedIn ? '#dfe6f2' : '#06121b',
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.03em',
            cursor: 'pointer',
            maxWidth: 'clamp(120px, 18vw, 220px)',
          }}
        >
          {accountSignedIn ? (
            <>
              <span
                aria-hidden
                style={{
                  width: 28, height: 28, borderRadius: 999, overflow: 'hidden', flex: '0 0 auto',
                  display: 'grid', placeItems: 'center', background: 'rgba(79,195,247,0.18)',
                  color: '#4fc3f7', fontSize: 13, fontWeight: 900,
                }}
              >
                {accountAvatarUrl ? (
                  <img src={accountAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (accountName[0] || '?').toUpperCase()
                )}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {accountName || 'Account'}
              </span>
            </>
          ) : (
            <>
              <UserIcon size={15} />
              <span>Sign In</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
