import React, { useEffect, useRef, useState } from 'react';
import { SINGLE_ASSET_BY_TYPE } from '../chessboard/assetsIndex.js';

const TYPES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };

export default function RuleIllustration({ rule }) {
  const [resolved, setResolved] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setResolved(true);
      return undefined;
    }
    timer.current = setTimeout(() => setResolved(true), 900);
    return () => clearTimeout(timer.current);
  }, []);
  return (
    <figure className={`qr-experiment qr-experiment--${rule.id}`}>
      <div className="qr-experiment-label">{resolved ? 'After' : 'Before'} · {rule.action}</div>
      <div className="qr-states">
        {rule.before.map((row, index) => {
          const after = rule.after[index];
          const current = resolved ? after : row;
          const union = Object.keys(TYPES).filter((type) => (row.types + after.types).includes(type));
          return (
            <div key={index} className="qr-state">
              <span className="qr-state-label">{current.label}</span>
              <div className="qr-ket" role="img" aria-label={`${current.label}: ${[...current.types].map((t) => TYPES[t]).join(' or ')}`}>
                <span aria-hidden="true" className="qr-bracket">|</span>
                {union.map((type) => (
                  <span key={type} aria-hidden="true" className={`qr-identity${current.types.includes(type) ? ' is-present' : ' is-absent'}`}>
                    <img src={SINGLE_ASSET_BY_TYPE[type]} alt="" /><small>{TYPES[type]}</small>
                  </span>
                ))}
                <span aria-hidden="true" className="qr-bracket">⟩</span>
              </div>
            </div>
          );
        })}
      </div>
      <figcaption>{rule.caption}</figcaption>
      <button className="qr-text-button" type="button" onClick={() => { clearTimeout(timer.current); setResolved((value) => !value); }}>
        {resolved ? 'Reset state' : rule.action} <span aria-hidden="true">↗</span>
      </button>
    </figure>
  );
}
