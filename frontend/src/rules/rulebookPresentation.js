// Reading order shared by the modal and public rulebook.
export const RULE_GROUPS = [
  { id: 'movement', title: 'Superposition & movement', label: 'Pieces & captures', nav: 'Movement', rules: ['measurement', 'capture'],
    intro: 'Each piece begins with all six identities. Move as any identity still present; retain only those compatible with the move. White moves first, then turns alternate.',
    note: 'If you land on an enemy, capture resolves it as its lowest-value identity. Captured pieces still count toward the fixed chess set, explained next in the census.' },
  { id: 'conservation', title: 'The quantum census', label: 'Conservation', nav: 'Census', rules: ['census'],
    intro: 'Each side must fit 8 Pawns, 2 Knights, 2 Bishops, 2 Rooks, 1 Queen and 1 King. Every living or captured piece occupies a slot in each admissible state.',
    note: 'The census runs after movement and capture, and again as interaction changes possibilities. Filling a slot in one place can rule out that identity elsewhere: a collapse cascade.' },
  { id: 'contact', title: 'Zap & Heal', label: 'Interaction', nav: 'Zap & Heal', rules: ['zap', 'heal'],
    intro: 'Interaction connects two familiar chess ideas: attacking an enemy and protecting an ally. After a move, enemies in the mover’s interaction pattern are Zap targets; allies in that pattern are Heal targets. Use the capture pattern of only the mover’s lowest-value identity: Pawn → Knight → Bishop → Rook → Queen → King.',
    note: 'Zap models quantum measurement: it narrows an enemy’s possibilities. Heal models quantum state preparation: a friendly interaction restores a possibility. Resolve enemy Zaps first, then friendly Heals. Each group resolves jointly with the census. Both effects are deterministic.' },
  { id: 'special', title: 'Special moves', label: 'Castling, en passant & promotion', nav: 'Special moves', rules: ['castle', 'enpassant', 'promotion'],
    intro: 'Castle two back-rank superpositions that each contain Rook and King. En passant projects both pieces onto Pawn. Promotion transforms the Pawn branch while preserving its Pawn census slot.',
    note: 'These moves obey the same conservation rules as the rest of the game. Open a rule below for its conditions.' },
  { id: 'checkmate', title: 'Checkmate & shields', label: 'Ending the game', nav: 'Checkmate & draws', rules: ['royal', 'draw'],
    intro: 'A revealed King is a piece whose only remaining identity is King. It is in check when an enemy can capture its square. A piece that still mixes King with other identities is not subject to check. Checkmate wins the game.',
    note: 'Zap preserves the final King possibility by attempting a lower identity. A gold shield marks an interaction with no admissible removal. Stalemate, threefold repetition and the fifty-move rule draw the game.' },
];

export const TUTORIAL_COPY = {
  eyebrow: 'The quickest way to learn',
  title: 'Learn on the board.',
  body: 'Play the guided tutorial. Make the moves, watch the collapses, and learn each rule as it happens.',
  action: 'Play the tutorial',
};

// Read this once before the reference; detailed exceptions follow in the sections below.
export const TURN_INTRO = 'White moves first. Turns alternate. A revealed King has only King left among its identities. After your move and all its effects resolve, any revealed King of yours must be on a square no enemy can capture.';

export const TURN_STEPS = [
  { title: 'Move and measure', text: 'Choose a move allowed by a remaining identity. Keep the identities that can make that move.' },
  { title: 'Resolve a capture', text: 'If an enemy is taken, resolve it as its cheapest remaining identity. It leaves the board but still counts in the chess set.' },
  { title: 'Apply the census', text: 'Every possibility must still fit one complete chess set per side. Remove identities that no longer fit.' },
  { title: 'Resolve interaction', text: 'From the landing square, use the mover’s lowest-value identity: Zap attacked enemies, then Heal protected allies. Recheck the census as these effects resolve.' },
  { title: 'Check the position', text: 'If the opponent has a piece with only King remaining and you attack its square, they are in check and must resolve it on their turn. If they have no legal reply, it is checkmate and you win. Stalemate and the other draw rules end the game in a draw. Otherwise, the other side moves.' },
];
