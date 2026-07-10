// frontend/src/hooks/useOnlineGame.js
// Purpose: The whole online-play cluster — matchmaking queue, private
// challenge rooms (create/join/cancel + invite card state), the room
// WebSocket connection and message routing (rejoin replay, opponent
// moves/castles, server clock, server-declared game over), move/castle/
// game-over relays, and the per-browser active-game record that makes games
// rejoinable after a reload. Extracted from App.jsx.
// Imports From: ../tray/matchmakingClient.js, ../hooks/clockUtils.js, ../devlog.js, ../store/*
// Exported To: ../App.jsx

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getOrCreateClientId, joinQueue, waitForMatch, leaveQueue, getStatus,
  connectToRoomWs, sendMoveWs, sendCastleWs, sendGameOverWs,
  createPrivateRoom, joinPrivateRoom, buildInviteLink, readJoinCode, stripJoinCode,
} from '../tray/matchmakingClient.js';
import { clampMs } from './clockUtils.js';
import { devDebug } from '../devlog.js';
import { addMove, resetGame, setUserTeam } from '../store/gameSlice.js';
import { setGameSettings } from '../store/settingsSlice.js';

// The active online game is remembered per-browser so a reload or dropped
// connection can rejoin it (the server replays the move history on welcome).
const ACTIVE_GAME_KEY = 'qcActiveOnlineGame';
function saveActiveOnlineGame(roomId, side) {
  try { localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify({ roomId, side })); } catch (_) {}
}
function readActiveOnlineGame() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_GAME_KEY) || 'null'); } catch (_) { return null; }
}
function clearActiveOnlineGame() {
  try { localStorage.removeItem(ACTIVE_GAME_KEY); } catch (_) {}
}

const IDLE_CLOCK = { active: 'none', whiteMs: 5 * 60 * 1000, blackMs: 5 * 60 * 1000 };

export default function useOnlineGame({
  dispatch,
  moves,
  replayMoves,
  getPieceAtSquare,
  movePiece,
  canCastleBetween,
  castlePieces,
  commitEngineResult,
  gameOver,
  winner,
  gameOverReason,
  setGameStarted,
  setInfoMessage,
  setExternalGameOver,
  bumpGameInstance,
}) {
  const [mmActive, setMmActive] = useState(false);
  const mmAbortRef = useRef(false);
  const mmClientIdRef = useRef(null);
  const mmRoomIdRef = useRef(null);
  const wsApiRef = useRef(null);
  const isOnlineGameRef = useRef(false);
  const wsMessageHandlerRef = useRef(null);

  const [serverClock, setServerClock] = useState(IDLE_CLOCK);

  // Challenge a friend: while waiting in a private room, show the invite
  // card. Cleared by the room_state broadcast when the friend connects.
  const [friendWait, setFriendWait] = useState(null); // { code, link }
  const friendWaitRef = useRef(null);
  useEffect(() => { friendWaitRef.current = friendWait; }, [friendWait]);
  const [inviteCopied, setInviteCopied] = useState(false);
  useEffect(() => { setInviteCopied(false); }, [friendWait]);
  const handleCopyInvite = useCallback(async () => {
    if (!friendWaitRef.current) return;
    try {
      await navigator.clipboard.writeText(friendWaitRef.current.link);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2500);
    } catch (_) { /* input stays selectable for manual copy */ }
  }, []);

  // Detach from the current room server-side and forget the rejoin record.
  const detachFromRoom = useCallback(() => {
    clearActiveOnlineGame();
    if (mmClientIdRef.current) leaveQueue(mmClientIdRef.current).catch(() => {});
  }, []);

  const relaysReady = () => Boolean(wsApiRef.current && mmRoomIdRef.current && mmClientIdRef.current);

  const relayMove = useCallback(({ from, to, side, enPassant }) => {
    if (!isOnlineGameRef.current || !relaysReady()) return;
    sendMoveWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, from, to, side, enPassant });
  }, []);

  const relayCastle = useCallback(({ side, plan }) => {
    if (!isOnlineGameRef.current || !relaysReady()) return;
    sendCastleWs(wsApiRef.current, { roomId: mmRoomIdRef.current, clientId: mmClientIdRef.current, side, plan });
  }, []);

  // Resign / draw agreement: tell the server (so the opponent hears about it
  // too) and detach. No-op offline.
  const reportManualGameOver = useCallback(({ winner: winSide, reason }) => {
    if (!isOnlineGameRef.current) return;
    if (relaysReady()) {
      sendGameOverWs(wsApiRef.current, {
        roomId: mmRoomIdRef.current,
        clientId: mmClientIdRef.current,
        winner: winSide,
        reason,
      });
    }
    detachFromRoom();
  }, [detachFromRoom]);

  // Engine-detected game over: both clients derive the same result
  // deterministically; first report wins. Then detach so the next Online
  // search can't re-match into the dead room.
  const reportedGameOverRef = useRef(false);
  useEffect(() => {
    if (!gameOver) {
      reportedGameOverRef.current = false;
      return;
    }
    if (isOnlineGameRef.current && !reportedGameOverRef.current && relaysReady()) {
      reportedGameOverRef.current = true;
      sendGameOverWs(wsApiRef.current, {
        roomId: mmRoomIdRef.current,
        clientId: mmClientIdRef.current,
        winner: winner || null,
        reason: gameOverReason || 'rules',
      });
    }
    if (isOnlineGameRef.current) detachFromRoom();
  }, [gameOver, winner, gameOverReason, detachFromRoom]);

  useEffect(() => {
    wsMessageHandlerRef.current = (msg) => {
      if (!msg || typeof msg !== 'object') return;
      const myId = mmClientIdRef.current;

      const maybeApplyClock = (clock) => {
        if (!clock) return;
        const w = clampMs(Number(clock.whiteMs || 0));
        const b = clampMs(Number(clock.blackMs || 0));
        const active = clock.active === 'white' || clock.active === 'black' ? clock.active : 'none';
        setServerClock({ whiteMs: w, blackMs: b, active });
      };

      if (msg.type === 'welcome') {
        devDebug('[WS][client] welcome', { you: msg.you, turn: msg.turn, seq: msg.seq });
        maybeApplyClock(msg.clock);
        // Rejoin: the server replays the room's move history; rebuild the
        // engine timeline from it when this client has no moves yet.
        if (Array.isArray(msg.history) && msg.history.length > 0 && moves.length === 0) {
          const applied = replayMoves(msg.history);
          for (const mv of applied) dispatch(addMove(mv));
          if (applied.length > 0) {
            setGameStarted(true);
            setInfoMessage('Rejoined your game in progress.');
          }
        }
        return;
      }
      if (msg.type === 'room_state') {
        devDebug('[WS][client] room_state', { connected: msg.connected, turn: msg.turn, seq: msg.seq });
        maybeApplyClock(msg.clock);
        // The invited friend just connected: the challenge is on.
        if (friendWaitRef.current && Array.isArray(msg.connected) && msg.connected.length >= 2) {
          setFriendWait(null);
          setInfoMessage('Your friend joined — game on! You are White.');
        }
        return;
      }
      if (msg.type === 'clock_update') {
        maybeApplyClock(msg.clock);
        return;
      }
      if (msg.type === 'error') {
        const detail = typeof msg.detail === 'string' ? msg.detail : 'Server rejected the last action.';
        console.warn('[WS][client] error', { detail });
        setInfoMessage(detail);
        return;
      }

      if (msg.type === 'game_over') {
        const winSide = msg.winner === 'white' || msg.winner === 'black' ? msg.winner : null;
        const reason = typeof msg.reason === 'string' && msg.reason ? msg.reason : 'time';
        let text;
        if (reason === 'time') {
          text = winSide ? `${winSide[0].toUpperCase()}${winSide.slice(1)} wins on time.` : 'Game over on time.';
        } else if (reason === 'first-move timeout') {
          // Void, not a draw: nobody ever moved, so the game never counted.
          text = 'Game voided — no first move was made.';
        } else if (!winSide && reason === 'abandonment') {
          text = 'Game voided — a player left before the game began.';
        } else if (!winSide) {
          text = `Draw by ${reason}.`;
        } else {
          text = `${winSide[0].toUpperCase()}${winSide.slice(1)} wins by ${reason}.`;
        }
        detachFromRoom();
        // Voided games (no winner, never really played) skip the winner
        // popup — and with it the game-record path — on purpose.
        const voided = !winSide && (reason === 'first-move timeout' || reason === 'abandonment');
        setExternalGameOver({ over: true, text, silent: voided });
        setInfoMessage(text);
        maybeApplyClock(msg.clock);
        return;
      }

      if (msg.type === 'move') {
        if (msg.by && myId && msg.by === myId) {
          maybeApplyClock(msg.clock);
          return;
        }
        const from = msg.from;
        const to = msg.to;
        const sideMsg = msg.side;
        if (typeof from !== 'string' || typeof to !== 'string') return;
        const piece = getPieceAtSquare(from);
        if (!piece) {
          console.warn('[WS][client] move: piece not found at from square', { from, to, sideMsg });
          maybeApplyClock(msg.clock);
          return;
        }
        const wsEnPassant = Boolean(msg.enPassant);
        let result = movePiece(piece.id, to, { enPassant: wsEnPassant });
        if (!result || !result.success) {
          // Robustness for interpretation mismatches: try the other reading.
          result = movePiece(piece.id, to, { enPassant: !wsEnPassant });
        }
        if (commitEngineResult(result, { message: 'Opponent moved.', quietFailure: true })) {
          devDebug('[WS][client] applied opponent move', { from, to, side: sideMsg });
        } else {
          console.warn('[WS][client] failed to apply opponent move', { from, to, sideMsg });
        }
        maybeApplyClock(msg.clock);
        return;
      }

      if (msg.type === 'castle') {
        if (msg.by && myId && msg.by === myId) {
          maybeApplyClock(msg.clock);
          return;
        }
        const { piece1_from, piece2_from, side: sideMsg } = msg;
        const p1 = getPieceAtSquare(piece1_from);
        const p2 = getPieceAtSquare(piece2_from);
        if (!p1 || !p2) {
          console.warn('[WS][client] castle: pieces not found at from squares', { p1: piece1_from, p2: piece2_from });
          maybeApplyClock(msg.clock);
          return;
        }
        const { canCastle, plan } = canCastleBetween(p1.id, p2.id);
        if (!canCastle || !plan) {
          console.warn('[WS][client] castle: cannot castle between received pieces', { piece1_from, piece2_from });
          maybeApplyClock(msg.clock);
          return;
        }
        const result = castlePieces(p1.id, p2.id);
        if (commitEngineResult(result, { message: 'Opponent castled.', quietFailure: true })) {
          devDebug('[WS][client] applied opponent castle', { plan, side: sideMsg });
        } else {
          console.warn('[WS][client] failed to apply opponent castle', { plan, side: sideMsg });
        }
        maybeApplyClock(msg.clock);
        return;
      }

      devDebug('[WS][client] unhandled message', msg);
    };
  }, [getPieceAtSquare, movePiece, canCastleBetween, castlePieces, dispatch, moves.length, replayMoves, commitEngineResult, detachFromRoom, setExternalGameOver, setGameStarted, setInfoMessage]);

  const startWsConnection = useCallback(({ roomId, clientId, side }) => {
    try {
      if (wsApiRef.current) wsApiRef.current.close();
    } catch (_) {}

    wsApiRef.current = connectToRoomWs({
      roomId,
      clientId,
      onOpen: () => {
        setInfoMessage(`Connected to room ${String(roomId).slice(0, 6)}`);
        devDebug('[WS][client] open', { roomId, clientId, side });
      },
      onClose: () => {
        setInfoMessage('Disconnected from game server.');
        devDebug('[WS][client] close', { roomId, clientId });
        setServerClock(IDLE_CLOCK);
      },
      onMessage: (msg) => {
        const fn = wsMessageHandlerRef.current;
        if (typeof fn === 'function') fn(msg);
      },
      onError: () => {
        console.error('[WS][client] error');
      },
    });
  }, [setInfoMessage]);

  // Challenge link: /?join=CODE seats this browser into a friend's private
  // room as black. The read is pure (StrictMode double-invokes initializers);
  // the URL param is stripped in the effect.
  const [pendingJoinCode] = useState(readJoinCode);
  const joinAttemptedRef = useRef(false);
  useEffect(() => {
    if (!pendingJoinCode || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true; // once per page load (StrictMode re-runs effects)
    stripJoinCode();
    const clientId = getOrCreateClientId();
    (async () => {
      try {
        const res = await joinPrivateRoom({ clientId, code: pendingJoinCode });
        if (res.status === 'matched' && res.roomId) {
          const side = res.side === 'black' || res.side === 'white' ? res.side : 'black';
          dispatch(setGameSettings({ gameMode: 'online' }));
          dispatch(resetGame());
          bumpGameInstance();
          mmClientIdRef.current = clientId;
          mmRoomIdRef.current = res.roomId;
          isOnlineGameRef.current = true;
          dispatch(setUserTeam(side));
          saveActiveOnlineGame(res.roomId, side);
          setGameStarted(true);
          setExternalGameOver({ over: false, text: '' });
          setInfoMessage(`Challenge accepted — you are ${side[0].toUpperCase()}${side.slice(1)}!`);
          startWsConnection({ roomId: res.roomId, clientId, side });
        } else if (res.status === 'room_full') {
          setInfoMessage('That challenge room is already full.');
        } else {
          setInfoMessage('That challenge link has expired — ask your friend for a new one.');
        }
      } catch (_) {
        setInfoMessage('Could not reach the game server to join the challenge.');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingJoinCode, startWsConnection]);

  // Rejoin: if this browser has an active online game (reload, dropped
  // connection), reattach to the room. The server keeps the seat warm for a
  // minute after a disconnect before ruling the game abandoned. The effect
  // is idempotent rather than run-once so StrictMode's dev double-mount
  // (which cancels the first run) still rejoins on the second.
  useEffect(() => {
    if (pendingJoinCode) return; // the challenge-link flow owns this session
    const saved = readActiveOnlineGame();
    if (!saved || !saved.roomId) return;
    let cancelled = false;
    (async () => {
      const clientId = getOrCreateClientId();
      try {
        const s = await getStatus(clientId);
        if (cancelled || isOnlineGameRef.current) return;
        if (s && s.status === 'matched' && s.roomId === saved.roomId) {
          const side = s.side === 'black' ? 'black' : 'white';
          mmClientIdRef.current = clientId;
          mmRoomIdRef.current = s.roomId;
          isOnlineGameRef.current = true;
          dispatch(setUserTeam(side));
          setGameStarted(true);
          setInfoMessage('Reconnecting to your game...');
          startWsConnection({ roomId: s.roomId, clientId, side });
        } else {
          clearActiveOnlineGame();
        }
      } catch (_) {
        // Backend unreachable; leave the record for a later attempt.
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, startWsConnection]);

  // Tear down a private challenge room while still waiting for the friend.
  const handleCancelFriendWait = useCallback(() => {
    setFriendWait(null);
    setGameStarted(false);
    isOnlineGameRef.current = false;
    clearActiveOnlineGame();
    try { if (wsApiRef.current) wsApiRef.current.close(); } catch (_) {}
    wsApiRef.current = null;
    mmRoomIdRef.current = null;
    if (mmClientIdRef.current) leaveQueue(mmClientIdRef.current).catch(() => {});
    setInfoMessage('Challenge cancelled.');
  }, [setGameStarted, setInfoMessage]);

  // Abort an online matchmaking search from the queue.
  const handleCancelSearch = useCallback(() => {
    mmAbortRef.current = true;
    setMmActive(false);
    setGameStarted(false);
    const id = mmClientIdRef.current;
    if (id) leaveQueue(id).catch(() => {});
    setInfoMessage('Search cancelled.');
  }, [setGameStarted, setInfoMessage]);

  // A new game (any mode) leaves online state behind: abort searches, forget
  // the rejoin record, close the socket, reset the clock display.
  const teardownForNewGame = useCallback(() => {
    mmAbortRef.current = true;
    clearActiveOnlineGame();
    isOnlineGameRef.current = false;
    try { if (wsApiRef.current) wsApiRef.current.close(); } catch (_) {}
    wsApiRef.current = null;
    setServerClock(IDLE_CLOCK);
  }, []);

  // handleStartGame's online branches. Returns true when the settings chose
  // an online mode (this hook owns the rest of the flow).
  const startOnlineGame = useCallback((settings) => {
    if (!settings || settings.gameMode !== 'online') return false;

    const clientId = getOrCreateClientId();
    mmClientIdRef.current = clientId;
    mmAbortRef.current = false;

    if (settings.privateFriend) {
      (async () => {
        try {
          try { await leaveQueue(clientId); } catch (_) {}
          const created = await createPrivateRoom({ clientId });
          if (created.status !== 'waiting' || !created.roomId || !created.code) {
            setGameStarted(false);
            setInfoMessage('Could not open a private room. Please try again.');
            return;
          }
          const link = buildInviteLink(created.code);
          mmRoomIdRef.current = created.roomId;
          isOnlineGameRef.current = true;
          dispatch(setUserTeam('white'));
          saveActiveOnlineGame(created.roomId, 'white');
          setFriendWait({ code: created.code, link });
          setInfoMessage('Waiting for your friend to join…');
          try { await navigator.clipboard.writeText(link); } catch (_) { /* copy button remains */ }
          startWsConnection({ roomId: created.roomId, clientId, side: 'white' });
        } catch (e) {
          setGameStarted(false);
          setInfoMessage('Failed to contact matchmaking service.');
        }
      })();
      return true;
    }

    const seatIntoRoom = (side, roomId) => {
      mmRoomIdRef.current = roomId;
      isOnlineGameRef.current = true;
      dispatch(setUserTeam(side));
      saveActiveOnlineGame(roomId, side);
      setInfoMessage(`Matched! You are ${side.toUpperCase()}. Room ${String(roomId || '').slice(0, 6)}`);
      setMmActive(false);
      startWsConnection({ roomId, clientId, side });
    };

    (async () => {
      try {
        // Detach from any previous room first: a finished game would
        // otherwise "re-match" us straight back into its dead room.
        try { await leaveQueue(clientId); } catch (_) {}
        const join = await joinQueue({ clientId });
        if (join.status === 'matched') {
          seatIntoRoom((join.side === 'white' || join.side === 'black') ? join.side : 'white', join.roomId);
          return;
        }
        if (join.status === 'queued') {
          setInfoMessage('Searching for an opponent...');
          setMmActive(true);
          const found = await waitForMatch(clientId, {
            intervalMs: 1200,
            timeoutMs: 60000,
            shouldStop: () => mmAbortRef.current,
          });
          if (found && found.status === 'matched') {
            seatIntoRoom((found.side === 'white' || found.side === 'black') ? found.side : 'white', found.roomId);
          } else if (!mmAbortRef.current) {
            // Timed out without a match: leave the queue cleanly.
            setMmActive(false);
            setGameStarted(false);
            leaveQueue(clientId).catch(() => {});
            setInfoMessage('No opponent found. Try again in a bit.');
          }
          return;
        }
        setInfoMessage('Matchmaking error. Please try again.');
      } catch (e) {
        setInfoMessage('Failed to contact matchmaking service.');
      }
    })();
    return true;
  }, [dispatch, startWsConnection, setGameStarted, setInfoMessage]);

  // Unmount: abort searches, close the socket, leave the queue.
  useEffect(() => {
    return () => {
      mmAbortRef.current = true;
      const id = mmClientIdRef.current;
      try {
        if (wsApiRef.current) wsApiRef.current.close();
      } catch (_) {}
      if (id) {
        leaveQueue(id).catch(() => {});
      }
    };
  }, []);

  return {
    isOnlineGameRef,
    mmActive,
    serverClock,
    friendWait,
    inviteCopied,
    handleCopyInvite,
    handleCancelFriendWait,
    handleCancelSearch,
    startOnlineGame,
    teardownForNewGame,
    relayMove,
    relayCastle,
    reportManualGameOver,
  };
}
