// frontend/src/tray/QuantumStatusPanel.jsx
// Purpose: Compact readout in the side tray showing the currently selected piece and the
// currently marked measurement target: side, square, remaining possibility types, and
// coherence level rendered as pips. Gives measurement warfare a visible instrument panel.
// Imports From: ../theme.js
// Exported To: ./SideTray.jsx

import React from 'react';
import theme from '../theme.js';
import { DEFAULT_MEASUREMENT_COLORS } from '../settings/useMeasurementColors.js';
import { Crosshair as CrosshairIcon, MousePointer as PointerIcon } from 'lucide-react';

const TYPE_LABELS = { p: 'P', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };
const MAX_COHERENCE = 3;
const FALLBACK_COLOR = '#ba55d1';

// Coherence damage is always drawn in the color of the side inflicting it.
function attackerColorFor(piece, colors) {
  if (!piece) return FALLBACK_COLOR;
  const attacker = piece.side === 'white' ? 'black' : 'white';
  return (colors || DEFAULT_MEASUREMENT_COLORS)[attacker] || FALLBACK_COLOR;
}

function CoherencePips({ value, color = FALLBACK_COLOR }) {
  const styles = {
    row: { display: 'inline-flex', alignItems: 'center', gap: 3 },
    pip: (filled) => ({
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: filled ? color : 'rgba(255,255,255,0.18)',
      border: `1px solid ${filled ? color : theme.border}`,
      boxSizing: 'border-box',
    }),
    label: { fontSize: 10, color: theme.textSecondary, marginLeft: 4, fontWeight: 700 },
  };
  return (
    <span className="qc-scope-pips" style={styles.row} title={`Coherence ${value}/${MAX_COHERENCE}`}>
      {Array.from({ length: MAX_COHERENCE }, (_, i) => (
        <span key={`scope-pip-${i}`} style={styles.pip(i < value)} />
      ))}
      <span style={styles.label}>{value}/{MAX_COHERENCE}</span>
    </span>
  );
}

function PieceReadout({ icon: Icon, iconColor, label, piece, emptyText, pipColor }) {
  const styles = {
    row: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minHeight: 26,
    },
    label: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: theme.textSecondary,
      width: 74,
      flexShrink: 0,
    },
    empty: { fontSize: 11, color: theme.textSecondary, opacity: 0.7, fontStyle: 'italic' },
    body: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      flexWrap: 'wrap',
      minWidth: 0,
    },
    sideDot: (side) => ({
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: side === 'white' ? '#f0f0f0' : '#222',
      border: `1px solid ${theme.border}`,
      flexShrink: 0,
    }),
    square: {
      fontSize: 11,
      fontWeight: 800,
      color: theme.textPrimary,
      textTransform: 'lowercase',
    },
    chips: { display: 'inline-flex', gap: 2 },
    chip: {
      fontSize: 10,
      fontWeight: 800,
      lineHeight: 1,
      padding: '3px 4px',
      borderRadius: 4,
      border: `1px solid ${theme.border}`,
      background: 'rgba(255,255,255,0.06)',
      color: theme.textPrimary,
    },
    collapsedNote: { fontSize: 10, color: theme.textSecondary },
  };

  const types = piece && Array.isArray(piece.possibleTypes) ? piece.possibleTypes : [];

  return (
    <div className="qc-scope-row" style={styles.row}>
      <span style={styles.label}>
        <Icon size={12} color={iconColor} />
        {label}
      </span>
      {piece ? (
        <span style={styles.body}>
          <span style={styles.sideDot(piece.side)} title={piece.side} />
          <span style={styles.square}>{piece.square || '—'}</span>
          <span style={styles.chips}>
            {types.map((t) => {
              const promoOnly = Array.isArray(piece.promoTypes) && piece.promoTypes.includes(t)
                && !(Array.isArray(piece.baseTypes) && piece.baseTypes.includes(t));
              return (
                <span
                  key={`chip-${t}`}
                  style={styles.chip}
                  title={promoOnly ? 'Only possible via promotion (occupies a pawn slot)' : undefined}
                >
                  {TYPE_LABELS[t] || '?'}{promoOnly ? '*' : ''}
                </span>
              );
            })}
          </span>
          {types.length > 2 ? (
            <CoherencePips
              value={Math.max(0, Math.min(MAX_COHERENCE, piece.coherence ?? MAX_COHERENCE))}
              color={pipColor || FALLBACK_COLOR}
            />
          ) : (piece.recohere || 0) > 0 ? (
            <span style={styles.collapsedNote}>recohering {piece.recohere}/3</span>
          ) : (
            <span style={styles.collapsedNote}>{types.length === 2 ? 'stable' : 'collapsed'}</span>
          )}
        </span>
      ) : (
        <span style={styles.empty}>{emptyText}</span>
      )}
    </div>
  );
}

export default function QuantumStatusPanel({
  selectedPiece = null,
  measuredCount = 0,
  measuringSide = null,
  measurementColors = null,
}) {
  const colors = measurementColors || DEFAULT_MEASUREMENT_COLORS;
  const styles = {
    root: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      padding: '8px 10px',
      borderBottom: `1px solid ${theme.border}`,
      background: 'rgba(255, 255, 255, 0.03)',
    },
    pulseRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      minHeight: 20,
      fontSize: 11,
      color: theme.textSecondary,
    },
    pulseLabel: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      color: theme.textSecondary,
      width: 74,
      flexShrink: 0,
    },
  };

  const pulseColor = measuringSide ? (colors[measuringSide] || FALLBACK_COLOR) : theme.textSecondary;

  return (
    <div className="qc-quantum-scope" style={styles.root} aria-label="Quantum scope: selected piece and last measurement pulse">
      <PieceReadout
        icon={PointerIcon}
        iconColor={theme.primary}
        label="Selected"
        piece={selectedPiece}
        emptyText="No piece selected"
        pipColor={attackerColorFor(selectedPiece, colors)}
      />
      <div className="qc-scope-pulse" style={styles.pulseRow}>
        <span style={styles.pulseLabel}>
          <CrosshairIcon size={12} color={pulseColor} />
          Pulse
        </span>
        <span>
          {measuringSide && measuredCount > 0
            ? `Last move soft-measured ${measuredCount} piece${measuredCount === 1 ? '' : 's'}`
            : 'Moves measure every piece they could capture'}
        </span>
      </div>
    </div>
  );
}
