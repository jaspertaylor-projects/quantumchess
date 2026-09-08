// frontend/src/components/AppModals.jsx
// Purpose: The app's modal stack — winner, en passant choice, settings,
// rules, friend-wait card, account, pricing, review, confirm, tutorial, and
// the two puzzle modals — as one passthrough component so App.jsx stays a
// wiring file. Extracted from App.jsx.
// Imports From: sibling modals + ../settings, ../tray, ../tutorial, ../account, ../review, ../puzzle
// Exported To: ../App.jsx

import React from 'react';
import WinnerModal from './WinnerModal.jsx';
import EnPassantChoiceModal from './EnPassantChoiceModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import FriendWaitCard from './FriendWaitCard.jsx';
import FriendInviteErrorCard from './FriendInviteErrorCard.jsx';
import SettingsModal from '../settings/SettingsModal.jsx';
import { DEFAULT_WHITE, DEFAULT_BLACK } from '../settings/usePieceColors.js';
import { DEFAULT_BOARD } from '../settings/useBoardColors.js';
import { DEFAULT_PLAYER_BAR_COLORS } from '../settings/usePlayerBarColors.js';
import RulesModal from '../tray/RulesModal.jsx';
import AccountModal from '../account/AccountModal.jsx';
import AdminStatsModal from '../admin/AdminStatsModal.jsx';
import PricingModal from '../account/PricingModal.jsx';
import MinedPuzzleModal from '../puzzle/MinedPuzzleModal.jsx';
import { isAdFree } from '../account/billing.js';

export default function AppModals({
  // game end
  showWinPopup, resolvedWinnerText, externalGameOver, winner, onCloseWinPopup,
  onPlayAgain, onGameReview, reviewAccess, reviewRemaining, reviewNotice,
  reviewDisabled, showPremiumPromo, onUpgradePromo, playAgainLabel,
  botUnlockReward, onChooseBot, onRequireBotAccess, onSignInForBots,
  // en passant choice
  pendingEpChoice, performMove, onCancelEpChoice,
  // settings
  settingsOpen, onCloseSettings, colors, indicators, showCoordinates, showCheckOverlay,
  moveSoundsEnabled, onAcceptSettings,
  // rules + tutorial
  rulesOpen, rulesInitialPage, onCloseRules, onOpenTutorial,
  // friend wait
  online, onChooseGameAfterInviteError,
  // account/pricing/review
  auth, accountOpen, accountPage, accountUpsellSource, onCloseAccount, billingReturn,
  handleReplayGame, handleReviewGame, handleShareGame, onAccountCreated,
  pricingOpen, onClosePricing,
  // admin stats dashboard
  adminStatsOpen, onOpenAdminStats, onCloseAdminStats,
  // mined-puzzle dev preview (?mined=N)
  minedPreview, onCloseMinedPreview, onCompleteMinedPreview,
  // confirm
  confirmState, setConfirmState,
  svgStyles,
  // sayings
  localSayings, onSaveLocalSayings,
  // player-bar identity (avatars/ratings) for the mined modal
  bars,
}) {
  const { whiteColors, blackColors, boardColors, playerBarColors } = colors;
  return (
    <>
      <WinnerModal
        open={showWinPopup}
        winnerText={resolvedWinnerText}
        title={externalGameOver.over ? 'Game Over' : (winner ? 'Checkmate' : 'Draw')}
        onClose={onCloseWinPopup}
        onPlayAgain={onPlayAgain}
        playAgainLabel={playAgainLabel}
        botUnlockReward={botUnlockReward}
        onChooseBot={onChooseBot}
        onRequireBotAccess={onRequireBotAccess}
        onSignInForBots={onSignInForBots}
        onGameReview={onGameReview}
        reviewAccess={reviewAccess}
        reviewRemaining={reviewRemaining}
        reviewNotice={reviewNotice}
        reviewDisabled={reviewDisabled}
        showPremiumPromo={showPremiumPromo}
        onUpgradePromo={onUpgradePromo}
      />

      <EnPassantChoiceModal
        open={Boolean(pendingEpChoice)}
        onEnPassant={() => {
          if (pendingEpChoice) performMove(pendingEpChoice.pieceId, pendingEpChoice.to, { enPassant: true });
        }}
        onQuiet={() => {
          if (pendingEpChoice) performMove(pendingEpChoice.pieceId, pendingEpChoice.to, { enPassant: false });
        }}
        onCancel={onCancelEpChoice}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={onCloseSettings}
        whiteColors={whiteColors}
        blackColors={blackColors}
        boardColors={boardColors}
        playerBarColors={playerBarColors}
        indicators={indicators}
        showCoordinates={showCoordinates}
        showCheckOverlay={showCheckOverlay}
        moveSoundsEnabled={moveSoundsEnabled}
        defaultWhiteColors={DEFAULT_WHITE}
        defaultBlackColors={DEFAULT_BLACK}
        defaultBoardColors={DEFAULT_BOARD}
        defaultPlayerBarColors={DEFAULT_PLAYER_BAR_COLORS}
        onAccept={onAcceptSettings}
        auth={auth}
        localSayings={localSayings}
        onSaveLocalSayings={onSaveLocalSayings}
      />

      <RulesModal
        open={rulesOpen}
        onClose={onCloseRules}
        initialPageTitle={rulesInitialPage}
        onOpenTutorial={onOpenTutorial}
      />

      <FriendWaitCard
        friendWait={online.friendWait}
        inviteCopied={online.inviteCopied}
        onCopyInvite={online.handleCopyInvite}
        onCancel={online.handleCancelFriendWait}
      />

      <FriendInviteErrorCard
        error={online.inviteError}
        onRetry={online.retryInvite}
        onChooseGame={onChooseGameAfterInviteError}
        onClose={online.dismissInviteError}
      />

      <AccountModal
        open={accountOpen}
        page={accountPage}
        onClose={onCloseAccount}
        auth={auth}
        upsellSource={accountUpsellSource}
        billingReturn={billingReturn}
        onReplayGame={handleReplayGame}
        onReviewGame={handleReviewGame}
        onShareGame={handleShareGame}
        onAccountCreated={onAccountCreated}
        onOpenAdminStats={onOpenAdminStats}
      />

      <AdminStatsModal
        open={Boolean(adminStatsOpen)}
        onClose={onCloseAdminStats}
        auth={auth}
      />

      <PricingModal
        open={pricingOpen && auth?.profile?.tier !== 'paid'}
        onClose={onClosePricing}
      />

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState ? confirmState.title : ''}
        message={confirmState ? confirmState.message : ''}
        confirmLabel={confirmState ? confirmState.confirmLabel : 'Confirm'}
        cancelLabel={confirmState ? confirmState.cancelLabel : 'Cancel'}
        variant={confirmState ? confirmState.variant : null}
        danger={Boolean(confirmState && confirmState.danger)}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const run = confirmState && confirmState.run;
          setConfirmState(null);
          if (run) run();
        }}
      />

      <MinedPuzzleModal
        open={Boolean(minedPreview)}
        onClose={onCloseMinedPreview}
        onComplete={onCompleteMinedPreview}
        puzzle={minedPreview}
        svgStyleBySide={svgStyles}
        boardColors={boardColors}
        playerBarColors={playerBarColors}
        selfAvatar={bars ? bars.selfAvatar : null}
        selfRating={bars ? bars.selfRating : null}
        strangerAvatar={bars ? bars.strangerAvatar : null}
        moveSoundsEnabled={moveSoundsEnabled}
        showDisplayAd={!isAdFree(auth.profile)}
      />

    </>
  );
}
