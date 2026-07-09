// frontend/src/components/ChevronBadge.jsx
// Purpose: The circular dropdown chevron shared by every stylized picker —
// neutral outlined circle when closed, accent-lit and rotated 180° when open.
// Imports From: react, lucide-react, ../theme.js
// Exported To: ../ladder/BotLadderPanel.jsx, ../tray/NewGamePanel.jsx

import React from 'react';
import { ChevronDown as ChevronDownIcon } from 'lucide-react';
import theme from '../theme.js';

export default function ChevronBadge({ open = false, gold = false }) {
  const accent = gold ? 'rgba(246,196,69,' : 'rgba(127,231,255,';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 26,
        flexShrink: 0,
        borderRadius: 999,
        border: `1px solid ${open ? `${accent}0.7)` : theme.border}`,
        background: open ? `${accent}0.14)` : 'rgba(255,255,255,0.05)',
        color: open ? (gold ? '#f6c445' : '#7fe7ff') : theme.textSecondary,
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform 0.25s ease, background 0.2s ease, border-color 0.2s ease, color 0.2s ease',
      }}
    >
      <ChevronDownIcon size={15} strokeWidth={2.75} />
    </span>
  );
}
