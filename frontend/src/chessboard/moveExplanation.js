import { buildOccupancy, subsetTypesThatCanMakeMove } from './engineGeometry.js';
import { fromAlgebraic } from './boardUtils.js';

const NAMES = { p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen', k: 'King' };
const names = (types) => types.map((t) => NAMES[t] || t).join(', ');

// Describe observed changes, without guessing the order of intermediate cascades.
export function explainMove(before, after, contact, { moverId, isCastle, usedEnPassant }) {
  const lines = [];
  const censusChanges = new Map();
  if (isCastle) lines.push('Quantum castle: the paired pieces move together and retain Rook/King possibilities.');
  if (usedEnPassant) lines.push('En passant: the double-stepping piece is captured from its landing square; both pieces resolve as Pawn.');
  for (const piece of after) {
    const old = before.find((p) => p.id === piece.id);
    if (!old || old.captured) continue;
    if (piece.captured) {
      lines.push(`${old.square}: captured as ${names(piece.possibleTypes)}, its cheapest remaining identity. It still counts in the census.`);
      continue;
    }
    const lost = old.possibleTypes.filter((t) => !piece.possibleTypes.includes(t));
    const gained = piece.possibleTypes.filter((t) => !old.possibleTypes.includes(t));
    if (!lost.length && !gained.length && old.wasPromoted === piece.wasPromoted) continue;
    const change = [lost.length ? `lost ${names(lost)}` : '', gained.length ? `gained ${names(gained)}` : ''].filter(Boolean).join('; ');
    let reason = 'The census propagates identity changes across the team so every piece still fits one chess-set slot.';
    if (piece.wasPromoted && !old.wasPromoted) reason = 'Promotion replaces the Pawn branch with Knight, Bishop, Rook and Queen possibilities.';
    else if (piece.id === moverId || (isCastle && piece.square !== old.square)) reason = 'Moving keeps only identities that can make this move; the census then resolves any forced changes.';
    else if (contact.zappedSquares?.includes(piece.square)) reason = 'Enemy contact removes the strongest jointly census-safe identity; the census may force further losses.';
    else if (contact.healedSquares?.includes(piece.square)) reason = 'Friendly contact restores a feasible missing identity, normally the cheapest; a kingless team tries King first.';
    if (reason.startsWith('The census propagates')) {
      const squares = censusChanges.get(change) || [];
      squares.push(piece.square);
      censusChanges.set(change, squares);
    } else lines.push(`${piece.square}: ${change || 'promoted'}. ${reason}`);
  }
  if (censusChanges.size) {
    lines.push('The census propagates changes across the team: these identities no longer fit the remaining chess-set slots.');
    for (const [change, squares] of censusChanges) lines.push(`${squares.join(', ')}: ${change}.`);
  }
  if (contact.fizzledSquares?.length) lines.push(`Shield on ${contact.fizzledSquares.join(', ')}: no identity could be removed while preserving the joint census and final King possibility.`);
  if (contact.failedHealSquares?.length) lines.push(`No heal on ${contact.failedHealSquares.join(', ')}: no joint regain survived the census and promotion restrictions.`);
  return lines.join('\n') || 'The piece moved without changing any remaining identities.';
}

// Called only after legal-move generation rejects a destination.
export function explainIllegalMove(pieces, piece, destination) {
  const from = fromAlgebraic(piece.square);
  const to = fromAlgebraic(destination);
  if (!from || !to) return 'Choose a square on the board.';
  const occupied = buildOccupancy(pieces);
  if (occupied.get(destination)?.side === piece.side) return `${destination} is occupied by your own piece. Choose an empty square or an enemy piece.`;
  const args = [piece.possibleTypes, from.fileIndex, from.rankIndex, to.fileIndex, to.rankIndex];
  if (subsetTypesThatCanMakeMove(...args, occupied, piece.side, !piece.moveCount).length) {
    return `${piece.square} → ${destination} would leave your revealed King capturable. Escape check, block the attack, or capture the attacker.`;
  }
  const withoutBlockers = new Map([...occupied].filter(([sq]) => sq === piece.square || sq === destination));
  if (subsetTypesThatCanMakeMove(...args, withoutBlockers, piece.side, !piece.moveCount).length) return `The path from ${piece.square} to ${destination} is blocked. Sliding pieces cannot jump over another piece.`;
  return `${piece.square} can currently move as ${names(piece.possibleTypes)}. None can move to ${destination} in this position. Pawns move forward and capture diagonally. Choose a highlighted square.`;
}
