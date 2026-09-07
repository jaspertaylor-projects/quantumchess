import React, { useMemo, useState } from 'react';
import Board from '../chessboard/Board.jsx';
import { DEFAULT_WHITE, DEFAULT_BLACK } from '../settings/usePieceColors.js';
import { createRuleExample, TYPE_NAMES } from './ruleExamples.js';

const STUDY_COLORS = Object.fromEntries([['white', DEFAULT_WHITE], ['black', DEFAULT_BLACK]].map(([side, colors]) => [side, {
  '--band-fill': colors.bandFill, '--band-stroke': colors.bandStroke,
  '--piece-outline': colors.pieceOutline, '--icon-color': colors.icon,
}]));
const names = (piece) => piece.possibleTypes.map((type) => TYPE_NAMES[type]).join(' · ');
const sideName = (side) => side === 'white' ? 'White' : 'Black';

export default function RuleIllustration({ rule }) {
  const example = useMemo(() => createRuleExample(rule.id), [rule.id]);
  const [index, setIndex] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [hint, setHint] = useState('');
  const [replay, setReplay] = useState(0);
  if (!example) return null;
  const frame = example.frames[index];
  const next = example.steps[index];
  const previous = example.steps[index - 1];
  const mover = next && frame.pieces.find((p) => !p.captured && p.square === next.from);
  const watched = example.watch.map((id) => frame.pieces.find((p) => p.id === id));
  const play = () => { if (next) { setIndex(index + 1); setSelectedId(null); setHint(''); } };
  const reset = () => { setIndex(0); setSelectedId(null); setHint(''); setReplay(replay + 1); };
  const instruction = next ? `${sideName(mover.side)}: ${next.kind === 'castle' ? 'select' : 'move'} ${next.from} → ${next.to}${next.kind === 'castle' ? ' to castle' : ''}` : 'Example complete';
  const chooseSquare = (square) => {
    if (!next) return;
    if (square === next.from) { setSelectedId(mover.id); setHint(`Now select ${next.to}.`); }
    else if (square === next.to && selectedId === mover.id) play();
    else setHint(`Follow this study move: select ${next.from}, then ${next.to}. You can also use the Play move button.`);
  };
  const highlights = watched.filter((p) => !p.captured).map((p) => ({ square: p.square, color: 'rgba(82,199,236,.3)' }));
  if (next) highlights.push({ square: next.from, color: 'rgba(255,209,102,.5)' }, { square: next.to, color: 'rgba(255,209,102,.5)' });
  for (const square of frame.zappedSquares || []) highlights.push({ square, color: 'rgba(247,93,117,.45)' });
  for (const square of frame.healedSquares || []) highlights.push({ square, color: 'rgba(54,216,126,.45)' });
  for (const square of frame.fizzledSquares || []) highlights.push({ square, color: 'rgba(255,209,102,.45)' });
  return <figure className={`qr-experiment qr-board-example qr-experiment--${rule.id}`}>
    <div className="qr-example-heading"><span className="qr-experiment-label">On the board · {example.title}</span><span className="qr-example-progress">{index === 0 ? `Ready · ${example.steps.length} move${example.steps.length > 1 ? 's' : ''}` : `Move ${index} of ${example.steps.length}`}</span></div>
    <div className="qr-example-layout">
      <div className="qr-example-board">
        <Board pieces={frame.pieces} pieceSvgStyles={STUDY_COLORS} maxVisualSize="100%" ariaLabel={`${rule.title} study board`}
          selectedId={selectedId} highlights={highlights}
          arrows={next && next.kind !== 'castle' ? [{ from: next.from, to: next.to, opacity: .65 }] : []}
          onSquareClick={({ square }) => chooseSquare(square)}
          onPieceClick={({ id }) => chooseSquare(frame.pieces.find((p) => p.id === id)?.square)}
          onPieceDragStart={(p) => { if (!next || next.kind === 'castle' || p.id !== mover.id) return false; setSelectedId(p.id); return true; }}
          onPieceDrop={({ from, to }) => { if (next && from === next.from && to === next.to) play(); else setHint(`The highlighted destination is ${next?.to}.`); }}
          legalMoves={next ? [next.to] : []}
          zapMarks={frame.zappedSquares} healMarks={frame.healedSquares} fizzleMarks={frame.fizzledSquares}
          failedHealMarks={frame.failedHealSquares} pulseOrigin={previous?.kind !== 'castle' ? previous?.to : null}
          effectKey={`${replay}-${index}`} />
        <div className="qr-board-key">Gold: move or shield · Blue: watch · Red: Zap · Green: Heal</div>
      </div>
      <div className="qr-example-guidance">
        <div className="qr-notice" role="status" aria-live="polite" aria-atomic="true"><span className="qr-eyebrow">{index ? 'What changed' : 'What to notice'}</span><p>{frame.notice}</p></div>
        <p className="qr-example-instruction">{instruction}</p>
        <div className="qr-example-controls">
          {next && <button className="qr-play-move" type="button" onClick={play}>{next.kind === 'castle' ? 'Castle the pair' : `Play ${next.from} → ${next.to}`}</button>}
          <button className="qr-reset-example" type="button" onClick={reset} disabled={index === 0 && !selectedId}>Reset example</button>
        </div>
        <p className="qr-example-hint" aria-live="polite">{hint || (next ? next.kind === 'castle' ? 'Select the two gold pieces, or press Castle the pair.' : 'Select the gold squares, drag the mover, or press Play.' : 'Reset to compare the position before the move.')}</p>
        <div className="qr-watch"><span className="qr-eyebrow">Pieces to watch</span>{watched.map((p) => {
          const before = example.frames[0].pieces.find((original) => original.id === p.id);
          return <div className="qr-watch-piece" key={p.id}>
            <strong>{sideName(p.side)} · {p.captured ? `${before.square} → captured` : before.square === p.square ? p.square : `${before.square} → ${p.square}`}</strong>
            <span>{index > 0 && names(before) !== names(p) && <span className="qr-before-types">{names(before)} → </span>}{names(p)}{p.captured ? ' · still counted' : ''}</span>
          </div>;
        })}</div>
      </div>
    </div>
    <figcaption><strong>Study position.</strong> The other pieces have been captured and still count in the census. {example.context}</figcaption>
  </figure>;
}
