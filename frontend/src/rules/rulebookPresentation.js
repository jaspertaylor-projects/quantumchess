// Reading order shared by the modal and public rulebook.
export const RULE_GROUPS = [
  { id: 'movement', title: 'Superposition & movement', label: 'Pieces & captures', nav: 'Movement', rules: ['measurement', 'capture'],
    intro: 'Each piece begins with all six identities. Move as any identity still present; retain only those compatible with the move. White moves first, then turns alternate.',
    note: 'Capture resolves the victim as its lowest-value identity. A captured Knight–Queen becomes Knight and still counts in the census.' },
  { id: 'contact', title: 'Zap & Heal', label: 'Interaction', nav: 'Zap & Heal', rules: ['zap', 'heal'],
    intro: 'Interaction connects two familiar chess ideas: attacking an enemy and protecting an ally. After a move, enemies in the mover’s interaction pattern are Zap targets; allies in that pattern are Heal targets. Use the capture pattern of only the mover’s lowest-value identity: Pawn → Knight → Bishop → Rook → Queen → King.',
    note: 'Zap models quantum measurement: it narrows an enemy’s possibilities. Heal models quantum state preparation: a friendly interaction restores a possibility. In this game, both effects are deterministic and must satisfy the census.' },
  { id: 'conservation', title: 'The quantum census', label: 'Conservation', nav: 'Census', rules: ['census'],
    intro: 'Each side must fit 8 Pawns, 2 Knights, 2 Bishops, 2 Rooks, 1 Queen and 1 King. Every living or captured piece occupies a slot in each admissible state.',
    note: 'A claim in one place constrains possibilities elsewhere. A zap can therefore trigger a collapse cascade across the board—even in pieces outside its interaction geometry.' },
  { id: 'checkmate', title: 'Checkmate & shields', label: 'Ending the game', nav: 'Checkmate & draws', rules: ['royal', 'draw'],
    intro: 'Check applies only when a piece has resolved to King alone. You cannot leave a revealed King capturable. Checkmate wins the game.',
    note: 'Zap preserves the final King possibility by attempting a lower identity. A gold shield marks an interaction with no admissible removal. Stalemate, threefold repetition and the fifty-move rule draw the game.' },
  { id: 'special', title: 'Special moves', label: 'Castling, en passant & promotion', nav: 'Special moves', rules: ['castle', 'enpassant', 'promotion'],
    intro: 'Castle two back-rank superpositions that each contain Rook and King. En passant projects both pieces onto Pawn. Promotion transforms the Pawn branch while preserving its Pawn census slot.',
    note: 'These moves obey the same conservation rules as the rest of the game. Open a rule below for its conditions.' },
];

export const TUTORIAL_COPY = {
  eyebrow: 'The quickest way to learn',
  title: 'Learn on the board.',
  body: 'Play the guided tutorial. Make the moves, watch the collapses, and learn each rule as it happens.',
  action: 'Play the tutorial',
};
