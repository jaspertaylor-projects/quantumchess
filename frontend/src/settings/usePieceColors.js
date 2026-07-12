// frontend/src/settings/usePieceColors.js
// Purpose: Manage per-side inline-SVG theming colors (icon, band fill, band stroke), persist them to localStorage, and expose a reset-to-defaults action.
// Imports From: ./usePersistentSetting.js
// Exported To: ../App.jsx, ./SettingsModal.jsx

import { useCallback, useMemo } from 'react';
import usePersistentSetting from './usePersistentSetting.js';

const STORAGE_KEYS = {
  white: 'qcWhiteSvgColors',
  black: 'qcBlackSvgColors',
};

export const DEFAULT_WHITE = {
  icon: '#343b35',
  bandFill: '#e8e3d8',
  bandStroke: '#343b35',
  pieceOutline: '#000000',
  pieceOutlineEnabled: true,
};

export const DEFAULT_BLACK = {
  icon: '#f0eadf',
  bandFill: '#39454f',
  bandStroke: '#d6d0c5',
  pieceOutline: '#d6d0c5',
  pieceOutlineEnabled: true,
};

export default function usePieceColors() {
  const [whiteColors, setWhiteColors, resetWhiteColors] = usePersistentSetting(STORAGE_KEYS.white, DEFAULT_WHITE);
  const [blackColors, setBlackColors, resetBlackColors] = usePersistentSetting(STORAGE_KEYS.black, DEFAULT_BLACK);

  const resetColors = useCallback(() => {
    resetWhiteColors();
    resetBlackColors();
  }, [resetWhiteColors, resetBlackColors]);

  const svgStyles = useMemo(() => ({
    white: {
      ['--band-fill']: whiteColors.bandFill,
      ['--band-stroke']: whiteColors.bandStroke,
      ['--piece-outline']: whiteColors.pieceOutlineEnabled ? whiteColors.pieceOutline : 'transparent',
      ['--icon-color']: whiteColors.icon,
    },
    black: {
      ['--band-fill']: blackColors.bandFill,
      ['--band-stroke']: blackColors.bandStroke,
      ['--piece-outline']: blackColors.pieceOutlineEnabled ? blackColors.pieceOutline : 'transparent',
      ['--icon-color']: blackColors.icon,
    },
  }), [whiteColors, blackColors]);

  return {
    whiteColors,
    blackColors,
    setWhiteColors,
    setBlackColors,
    resetColors,
    svgStyles,
  };
}
