// frontend/src/components/appLayoutStyles.js
// Purpose: The App shell's inline layout styles, parameterized on the narrow
// (phone) layout. Extracted from App.jsx.
// Imports From: ../theme.js
// Exported To: ../App.jsx

import theme from '../theme.js';

export default function appLayoutStyles(isNarrow) {
  return {
    appContainer: {
      backgroundColor: theme.boardAreaBackground,
      color: theme.textPrimary,
      height: '100vh',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingTop: 'env(safe-area-inset-top)',
      paddingRight: 'env(safe-area-inset-right)',
      // Phones reserve both the fixed 66px action row and its ~28px status
      // lane. The status line is absolutely positioned above MobileBar, so
      // omitting this second reservation lets messages cover captured pieces.
      paddingBottom: isNarrow ? 'calc(env(safe-area-inset-bottom) + 94px)' : 'calc(env(safe-area-inset-bottom) + 12px)',
      paddingLeft: 'env(safe-area-inset-left)',
      boxSizing: 'border-box',
      gap: '0.5rem',
      overflow: 'hidden',
    },
    boardArea: {
      flex: 1,
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      padding: 'clamp(8px, 2vh, 16px)',
      overflow: 'hidden',
      backgroundColor: theme.boardAreaBackground,
    },
    boardStack: {
      width: '100%',
      height: '100%',
      maxWidth: isNarrow ? 'min(96vmin, 1200px)' : 'min(98vw, 1500px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'stretch',
      gap: '8px',
      boxSizing: 'border-box',
    },
    boardStage: {
      width: '100%',
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      // Centering (instead of letting the board row flex-grow) keeps the
      // player bars hugging the board on phones; spare space goes outside.
      justifyContent: 'center',
      gap: isNarrow ? 4 : 8,
      boxSizing: 'border-box',
      overflow: 'hidden',
    },
    boardRow: {
      width: '100%',
      display: 'flex',
      flexDirection: isNarrow ? 'column' : 'row',
      alignItems: isNarrow ? 'stretch' : 'center',
      justifyContent: 'center',
      gap: isNarrow ? 8 : 12,
      minHeight: 0,
    },
    boardHolder: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      position: 'relative', // anchors the pre-game start CTA overlay
    },
    footer: {
      textAlign: 'center',
      // Recover most of the mobile status-lane reservation from decorative
      // footer whitespace rather than shrinking the board.
      padding: isNarrow ? '2px 0 4px' : '10px 0 16px',
      fontSize: isNarrow ? 10 : 12,
      color: theme.textSecondary,
      opacity: 0.7,
    },
    footerLink: { color: theme.textSecondary, textDecoration: 'none', margin: '0 8px' },
  };
}
