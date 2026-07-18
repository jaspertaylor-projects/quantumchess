// Position-aware draw-offer policy for local bots. The static evaluation is
// viewed from the bot's side, then tempered by tier, game age, remaining
// material, repetition pressure, and the bot's existing search-noise style.

import { DEFAULT_WEIGHTS, evaluatePosition } from './alphaBetaEngine.js';
import { computePositionSignature } from '../chessboard/quantumEngine.js';

const POLICY_BY_TIER = {
  easy: { losing: -0.65, equal: 0.42, minPly: 20, longGamePly: 48 },
  medium: { losing: -1.0, equal: 0.28, minPly: 28, longGamePly: 58 },
  hard: { losing: -1.4, equal: 0.16, minPly: 36, longGamePly: 68 },
};

export function decideDrawFromContext({
  botAdvantage,
  tier = 'medium',
  moveCount = 0,
  livePieceCount = 32,
  repetitionCount = 0,
  noise = 0,
}) {
  const policy = POLICY_BY_TIER[tier] || POLICY_BY_TIER.medium;
  const temperament = Math.min(0.35, Math.max(0, Number(noise) || 0) * 0.15);
  const losingThreshold = policy.losing + temperament;

  if (botAdvantage <= losingThreshold) {
    return { accept: true, reason: 'The bot judges its position to be meaningfully worse.' };
  }

  if (botAdvantage >= 0.75) {
    return { accept: false, reason: 'The bot believes it still has the better chances.' };
  }

  if (repetitionCount >= 2 && botAdvantage <= 0.6) {
    return { accept: true, reason: 'The position is already circling toward repetition.' };
  }

  const equalWindow = policy.equal + temperament * 0.5;
  const oldEnough = moveCount >= Math.max(12, policy.minPly - Math.round(temperament * 12));
  const drawishStage = livePieceCount <= 12 || moveCount >= policy.longGamePly;
  if (oldEnough && drawishStage && Math.abs(botAdvantage) <= equalWindow) {
    return { accept: true, reason: 'The bot sees a balanced, drawish late position.' };
  }

  if (!oldEnough) {
    return { accept: false, reason: 'The bot thinks there is too much game left to settle now.' };
  }
  return { accept: false, reason: 'The bot still sees enough imbalance to keep playing.' };
}

export function decideBotDrawOffer({
  pieces = [],
  bot,
  aiSide,
  sideToMove,
  moveCount = 0,
  repetitionSigs = {},
  lastMove = null,
}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(bot?.weights || {}) };
  const whiteAdvantage = evaluatePosition(pieces, weights);
  const botAdvantage = (aiSide === 'black' ? -1 : 1) * whiteAdvantage;
  const signature = computePositionSignature(pieces, sideToMove, lastMove);
  const repetitionCount = Number(repetitionSigs?.[signature]) || 0;
  const livePieceCount = pieces.filter((piece) => !piece.captured && piece.square).length;
  const decision = decideDrawFromContext({
    botAdvantage,
    tier: bot?.tier,
    moveCount,
    livePieceCount,
    repetitionCount,
    noise: bot?.search?.noise,
  });
  return { ...decision, botAdvantage };
}
