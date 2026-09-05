// Purpose: Reusable version of the Welcome page's six-piece quantum orbit.
// Used both as the landing-page centerpiece and as branded loading artwork.

import React from 'react';
import QuantumPiece from '../chessboard/QuantumPiece.jsx';
import './WelcomeLanding.css';

// Material order is also the orbit order: cheapest on the widest ring,
// King closest to the unresolved six-type state in the center.
const orbitPieces = [
  { type: 'p', label: 'Pawn', inset: '1%', duration: '24s', delay: '-3s' },
  { type: 'n', label: 'Knight', inset: '7.5%', duration: '21s', delay: '-14s' },
  { type: 'b', label: 'Bishop', inset: '14%', duration: '18s', delay: '-7s' },
  { type: 'r', label: 'Rook', inset: '20.5%', duration: '15s', delay: '-11s' },
  { type: 'q', label: 'Queen', inset: '27%', duration: '12s', delay: '-5s' },
  { type: 'k', label: 'King', inset: '33.5%', duration: '9s', delay: '-2s' },
];

const welcomePieceStyles = {
  white: {
    '--band-fill': '#dff8ff',
    '--band-stroke': '#21354d',
    '--piece-outline': '#6ee7ff',
    '--icon-color': '#17243a',
  },
  black: {},
};

export default function QuantumOrbit({
  className = '',
  ariaLabel = 'Pawn, Knight, Bishop, Rook, Queen, and King orbit a full quantum superposition',
  ariaHidden = false,
}) {
  return (
    <div
      className={`qc-welcome-quantum${className ? ` ${className}` : ''}`}
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : ariaLabel}
      aria-hidden={ariaHidden || undefined}
    >
      <div className="qc-welcome-quantum-glow" aria-hidden="true" />
      {orbitPieces.map((piece) => (
        <div
          key={piece.type}
          className={`qc-welcome-piece-orbit qc-welcome-piece-orbit--${piece.type}`}
          style={{
            '--orbit-inset': piece.inset,
            '--orbit-duration': piece.duration,
            '--orbit-delay': piece.delay,
          }}
          aria-hidden="true"
        >
          <div className="qc-welcome-orbit-anchor">
            <div className="qc-welcome-orbit-upright">
              <QuantumPiece
                id={`welcome-${piece.type}`}
                side="white"
                possibleTypes={[piece.type]}
                size={48}
                ariaLabel={piece.label}
                svgStyleBySide={welcomePieceStyles}
              />
            </div>
          </div>
        </div>
      ))}

      <div className="qc-welcome-superposition" aria-hidden="true">
        <QuantumPiece
          id="welcome-superposition"
          side="white"
          possibleTypes={['p', 'n', 'b', 'r', 'q', 'k']}
          size={118}
          ariaLabel="Full six-piece quantum superposition"
          svgStyleBySide={welcomePieceStyles}
        />
      </div>
    </div>
  );
}
