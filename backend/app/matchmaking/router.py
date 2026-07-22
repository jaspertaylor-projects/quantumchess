# backend/app/matchmaking/router.py
# Purpose: FastAPI router exposing RESTful matchmaking endpoints and a WebSocket endpoint to relay real-time game events and authoritative server-side chess clock state per room.
# Imports From: .models, .service, app.stats.sampler, app.stats.supabase_writer
# Exported To: app.main

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import time
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Query, WebSocket, WebSocketDisconnect

from app.account import supabase_gateway
from app.stats import sampler as stats_sampler
from app.stats import supabase_writer

from . import service
from .models import (
    CreatePrivatePayload,
    HeartbeatPayload,
    JoinPayload,
    JoinPrivatePayload,
    LeavePayload,
    MatchResponse,
)

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])  # noqa: E231
_logger = logging.getLogger("uvicorn.error")


def _bearer_token(authorization: Optional[str]) -> str:
    value = (authorization or "").strip()
    if len(value) > 7 and value[:7].lower() == "bearer ":
        return value[7:].strip()
    return ""


@router.post("/join", response_model=MatchResponse)
async def matchmaking_join(
    payload: JoinPayload, authorization: Optional[str] = Header(default=None)
) -> MatchResponse:
    identity = None
    if payload.ranked:
        try:
            identity = await asyncio.to_thread(
                supabase_gateway.authenticate_player, _bearer_token(authorization)
            )
        except supabase_gateway.InvalidAccessToken as exc:
            raise HTTPException(status_code=401, detail=str(exc)) from exc
        except supabase_gateway.AccountServiceUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
    return service.join(payload.clientId, ranked=payload.ranked, identity=identity)


@router.get("/status/{client_id}", response_model=MatchResponse)
def matchmaking_status(
    client_id: str, ticket: Optional[str] = Query(default=None)
) -> MatchResponse:
    return service.get_status(client_id, ticket)


# Challenge a friend: open a private room + invite code, then the friend
# seats themselves with the code. The WS relay treats the room like any other.
@router.post("/create-private", response_model=MatchResponse)
def matchmaking_create_private(payload: CreatePrivatePayload) -> MatchResponse:
    return service.create_private(payload.clientId)


@router.post("/join-private", response_model=MatchResponse)
def matchmaking_join_private(payload: JoinPrivatePayload) -> MatchResponse:
    return service.join_private(payload.clientId, payload.code)


@router.post("/leave")
def matchmaking_leave(payload: LeavePayload) -> Dict[str, Any]:
    return service.leave(payload.clientId, payload.ticket)


@router.post("/heartbeat")
def matchmaking_heartbeat(payload: HeartbeatPayload) -> Dict[str, Any]:
    return service.heartbeat(payload.clientId, payload.ticket)


@router.get("/metrics")
def matchmaking_metrics() -> Dict[str, Any]:
    m = service.metrics()
    stats_sampler.observe(m)
    m["activeGames"] = int(m.get("rooms", 0)) - int(m.get("openRooms", 0))
    m.update(stats_sampler.peaks_view())
    return m


# ------------------------------ WebSocket Game Relay ---------------------------

# In-memory ephemeral WS connections per room
# { room_id: { "conns": { clientId: WebSocket }, "turn": "white"|"black", "seq": int, "lock": asyncio.Lock,
#              "clock": { "baseMs": int, "incMs": int, "whiteMs": int, "blackMs": int, "active": str,
#                         "lastMono": float, "started": bool }, "clock_task": asyncio.Task|None,
#              "draw_offer_by": "white"|"black"|None,
#              "ended": bool, "winner": str|None, "end_reason": str|None, "announced_end": bool } }
_WS_ROOMS: Dict[str, Dict[str, Any]] = {}

# A game that never sees a first move within this window is voided.
FIRST_MOVE_TIMEOUT_S = 30.0
# A player who stays disconnected this long forfeits (remaining player wins);
# if nobody ever moved, the game is voided instead.
DISCONNECT_TIMEOUT_S = 60.0


def _other_side(side: str) -> str:
    return "black" if side == "white" else "white"


def _now_mono() -> float:
    return time.monotonic()


def _get_room_state(room_id: str) -> Dict[str, Any]:
    return _WS_ROOMS.setdefault(
        room_id,
        {
            "conns": {},
            "turn": "white",
            "seq": 0,
            "lock": asyncio.Lock(),
            "ended": False,
            "winner": None,
            "end_reason": None,
            "announced_end": False,
            "history": [],
            "draw_offer_by": None,
            "both_connected_at": None,
            "dc_at": {},
            # The initial online release has one server-authoritative clock:
            # five minutes with five seconds added after every move.
            "clock": {
                "baseMs": 5 * 60 * 1000,
                "incMs": 5 * 1000,
                "whiteMs": 5 * 60 * 1000,
                "blackMs": 5 * 60 * 1000,
                "active": "none",  # "white" | "black" | "none"
                "lastMono": _now_mono(),
                "started": False,
            },
            "clock_task": None,
        },
    )


def _end_game_locked(state: Dict[str, Any], winner: Optional[str], reason: str) -> None:
    """Mark the game over and freeze the clock. Call under the room lock."""
    state["ended"] = True
    state["winner"] = winner
    state["end_reason"] = reason
    state["draw_offer_by"] = None
    clk = state.get("clock", {})
    clk["active"] = "none"
    state["clock"] = clk


def _draw_offer_view(state: Dict[str, Any]) -> Optional[Dict[str, str]]:
    offered_by = state.get("draw_offer_by")
    return {"offeredBy": offered_by} if offered_by in ("white", "black") else None


def _transition_draw_offer_locked(state: Dict[str, Any], side: str, action: str) -> Dict[str, Any]:
    """Apply one draw-offer action while the room lock is held.

    Offers are independent of turn and survive normal moves. Accept/decline
    belongs only to the opponent; retract belongs only to the offerer.
    """
    if state.get("ended"):
        return {"error": "game_over"}
    if side not in ("white", "black"):
        return {"error": "unknown_side"}

    offered_by = state.get("draw_offer_by")
    if action == "offer":
        if offered_by and offered_by != side:
            return {"error": "draw_offer_pending"}
        state["draw_offer_by"] = side
        return {"status": "pending", "offeredBy": side, "resolution": "offered"}

    if action == "retract":
        if offered_by != side:
            return {"error": "no_owned_draw_offer"}
        state["draw_offer_by"] = None
        return {"status": "cleared", "offeredBy": None, "resolution": "retracted"}

    if action in ("accept", "decline"):
        if offered_by not in ("white", "black"):
            return {"error": "no_draw_offer"}
        if offered_by == side:
            return {"error": "offerer_cannot_answer"}
        state["draw_offer_by"] = None
        if action == "accept":
            _end_game_locked(state, None, "agreement")
            return {"status": "cleared", "offeredBy": None, "resolution": "accepted", "gameOver": True}
        return {"status": "cleared", "offeredBy": None, "resolution": "declined"}

    return {"error": "invalid_draw_offer_action"}


def _transition_terminal_claim_locked(
    state: Dict[str, Any], side: str, winner: Optional[str], reason: str
) -> Dict[str, Any]:
    """Resolve a resignation or collect two matching engine-end claims."""
    if state.get("ended"):
        return {"error": "game_over"}
    if side not in ("white", "black"):
        return {"error": "unknown_side"}
    if reason == "agreement":
        return {"error": "use_draw_offer_protocol"}
    if reason == "resignation":
        _end_game_locked(state, _other_side(side), "resignation")
        return {"gameOver": True}

    claim = {"winner": winner, "reason": reason}
    claims = state.setdefault("terminal_claims", {})
    claims[side] = claim
    if claims.get(_other_side(side)) != claim:
        return {"pending": True}
    _end_game_locked(state, winner, reason)
    return {"gameOver": True}


def _record_finished_online_game(state: Dict[str, Any]) -> None:
    """Persist an online game's outcome for the admin stats dashboard.
    Fire-and-forget (threaded insert); safe to call under the room lock."""
    winner = state.get("winner")
    reason = state.get("end_reason") or "rules"
    if winner in ("white", "black"):
        result = winner
    elif state.get("seq", 0) == 0 and reason in ("first-move timeout", "abandonment"):
        result = "void"  # nobody ever moved (first-move timeout / instant abandon)
    else:
        result = "draw"
    supabase_writer.insert_row(
        "qc_finished_games",
        {
            "mode": "online",
            "result": result,
            "end_reason": reason[:40],
            "move_count": int(state.get("seq", 0)),
        },
    )


def _game_over_payload_locked(room_id: str, state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """The exactly-once game_over broadcast payload, or None if a prior path
    already announced this room's end. Call under the room lock."""
    if state.get("announced_end"):
        return None
    state["announced_end"] = True
    _record_finished_online_game(state)
    return {
        "type": "game_over",
        "roomId": room_id,
        "reason": state.get("end_reason") or "rules",
        "winner": state.get("winner"),
        "seq": state.get("seq", 0),
        "turn": state.get("turn", "white"),
        "clock": _clock_view(state),
    }


async def _publish_game_over(
    room_id: str, state: Dict[str, Any], payload: Dict[str, Any]
) -> None:
    """Finalize a ranked result atomically before announcing it to clients."""
    # The cached full-room snapshot survives either client detaching while
    # finalization is in flight; live room membership may already be smaller.
    snapshot = state.get("room_snapshot") or service.get_room_snapshot(room_id) or {}
    if snapshot.get("ranked"):
        sides = snapshot.get("sides") or {}
        identities = snapshot.get("identities") or {}
        white_client = next((cid for cid, side in sides.items() if side == "white"), None)
        black_client = next((cid for cid, side in sides.items() if side == "black"), None)
        white = identities.get(white_client, {}) if white_client else {}
        black = identities.get(black_client, {}) if black_client else {}
        winner = state.get("winner")
        reason = state.get("end_reason") or "rules"
        result = (
            winner
            if winner in ("white", "black")
            else "void"
            if state.get("seq", 0) == 0 and reason in ("first-move timeout", "abandonment")
            else "draw"
        )
        if white.get("user_id") and black.get("user_id"):
            started_epoch = float(snapshot.get("created_at") or time.time())
            rpc_payload = {
                "p_room_id": room_id,
                "p_white_user_id": white["user_id"],
                "p_black_user_id": black["user_id"],
                "p_result": result,
                "p_end_reason": str(reason)[:64],
                "p_moves": list(state.get("history", [])),
                "p_started_at": datetime.datetime.fromtimestamp(
                    started_epoch, tz=datetime.timezone.utc
                ).isoformat(),
            }
            try:
                rating = await asyncio.to_thread(
                    supabase_gateway.finalize_ranked_match, rpc_payload
                )
                if not rating.get("match_id"):
                    raise RuntimeError("ranked finalization returned no match id")
                payload["rated"] = bool(rating.get("rated"))
                payload["ratingChanges"] = {
                    "white": {
                        "before": rating.get("white_rating_before"),
                        "after": rating.get("white_rating_after"),
                    },
                    "black": {
                        "before": rating.get("black_rating_before"),
                        "after": rating.get("black_rating_after"),
                    },
                }
            except Exception as exc:
                # Gameplay still concludes if persistence is temporarily down;
                # the room remains idempotently finalizable by its unique id.
                _logger.error("Ranked finalization failed for room %s: %s", room_id, exc)
                payload["rated"] = False
                payload["ratingError"] = True
                if not state.get("ranked_finalize_task"):
                    async def _retry() -> None:
                        for delay in (2, 5, 15, 30, 60):
                            await asyncio.sleep(delay)
                            try:
                                saved = await asyncio.to_thread(
                                    supabase_gateway.finalize_ranked_match, rpc_payload
                                )
                                if saved.get("match_id"):
                                    state["ranked_finalized"] = True
                                    _logger.info("Ranked finalization retry succeeded for %s", room_id)
                                    return
                            except Exception as retry_exc:
                                _logger.error(
                                    "Ranked finalization retry failed for %s: %s",
                                    room_id,
                                    retry_exc,
                                )
                        state["ranked_finalize_failed"] = True

                    state["ranked_finalize_task"] = asyncio.create_task(_retry())
    await _broadcast(room_id, payload)


async def _send(ws: WebSocket, payload: Dict[str, Any]) -> None:
    try:
        await ws.send_text(json.dumps(payload))
    except Exception:
        # Best-effort; ignore send failures
        pass


async def _broadcast(room_id: str, payload: Dict[str, Any]) -> None:
    state = _get_room_state(room_id)
    conns = list(state["conns"].values())
    if not conns:
        print(
            f"[WS][broadcast] room={room_id} no_connections payload.type={payload.get('type')}"
        )
        return
    text = json.dumps(payload)
    keys = list(state["conns"].keys())
    print(
        f"[WS][broadcast] room={room_id} type={payload.get('type')} seq={payload.get('seq')} turn={payload.get('turn')} to={keys}"
    )
    for ws in conns:
        try:
            await ws.send_text(text)
        except Exception:
            continue


def _settle_clock_locked(state: Dict[str, Any]) -> None:
    # Mutates stored whiteMs/blackMs by subtracting elapsed from active side.
    clk = state.get("clock", {})
    nowm = _now_mono()
    active = clk.get("active", "none")
    last = float(clk.get("lastMono", nowm))
    if active in ("white", "black"):
        elapsed_ms = int(max(0.0, (nowm - last) * 1000.0))
        if elapsed_ms > 0:
            if active == "white":
                clk["whiteMs"] = max(0, int(clk.get("whiteMs", 0)) - elapsed_ms)
            else:
                clk["blackMs"] = max(0, int(clk.get("blackMs", 0)) - elapsed_ms)
            clk["lastMono"] = nowm
            # Stop the clock if time hit zero
            if clk.get("whiteMs", 0) <= 0 or clk.get("blackMs", 0) <= 0:
                clk["active"] = "none"
    else:
        clk["lastMono"] = nowm
    state["clock"] = clk


def _clock_view(state: Dict[str, Any]) -> Dict[str, Any]:
    # Returns a snapshot suitable for clients. Includes dynamic elapsed without mutating stored values.
    clk = state.get("clock", {})
    nowm = _now_mono()
    active = clk.get("active", "none")
    last = float(clk.get("lastMono", nowm))
    w = int(clk.get("whiteMs", 0))
    b = int(clk.get("blackMs", 0))
    if active in ("white", "black"):
        elapsed_ms = int(max(0.0, (nowm - last) * 1000.0))
        if elapsed_ms > 0:
            if active == "white":
                w = max(0, w - elapsed_ms)
            else:
                b = max(0, b - elapsed_ms)
    base_ms = int(clk.get("baseMs", 0))
    inc_ms = int(clk.get("incMs", 0))
    return {
        "baseMs": base_ms,
        "incMs": inc_ms,
        "whiteMs": int(w),
        "blackMs": int(b),
        "active": active,
        "serverNow": time.time(),
    }


async def _ensure_clock_task(room_id: str) -> None:
    state = _get_room_state(room_id)
    if state.get("clock_task") and not state["clock_task"].done():
        return

    async def _clock_loop() -> None:
        try:
            while True:
                await asyncio.sleep(0.5)
                s = _get_room_state(room_id)
                # End loop if no connections remain
                if not s["conns"]:
                    break

                game_over_payload: Optional[Dict[str, Any]] = None

                # Evaluate clock and possible time loss; settle under lock and compute payload
                async with s["lock"]:
                    _settle_clock_locked(s)
                    clk = s.get("clock", {})
                    if not s.get("ended") and bool(clk.get("started")):
                        if int(clk.get("whiteMs", 0)) <= 0:
                            _end_game_locked(s, "black", "time")
                        elif int(clk.get("blackMs", 0)) <= 0:
                            _end_game_locked(s, "white", "time")

                    nowm = _now_mono()
                    if not s.get("ended"):
                        bca = s.get("both_connected_at")
                        if s.get("seq", 0) == 0 and bca and (nowm - bca) > FIRST_MOVE_TIMEOUT_S:
                            # Nobody moved within the window: void the game.
                            _end_game_locked(s, None, "first-move timeout")
                        else:
                            for dcid, ts in list((s.get("dc_at") or {}).items()):
                                if (nowm - ts) > DISCONNECT_TIMEOUT_S:
                                    winner = None
                                    if s.get("seq", 0) > 0:
                                        side_gone = service.get_side_for_client(room_id, dcid)
                                        winner = _other_side(side_gone) if side_gone in ("white", "black") else None
                                    _end_game_locked(s, winner, "abandonment")
                                    break

                    if s.get("ended"):
                        game_over_payload = _game_over_payload_locked(room_id, s)

                    # Prepare a periodic clock update snapshot regardless
                    view = _clock_view(s)
                    clock_payload = {
                        "type": "clock_update",
                        "roomId": room_id,
                        "clock": view,
                        "turn": s.get("turn", "white"),
                        "seq": s.get("seq", 0),
                    }

                # Broadcast game over exactly once if triggered, else normal clock update
                if game_over_payload is not None:
                    await _publish_game_over(room_id, s, game_over_payload)
                else:
                    await _broadcast(room_id, clock_payload)
        except Exception as ex:
            try:
                print(f"[WS][clock][task_error] room={room_id} ex={ex}")
            except Exception:
                pass

    state["clock_task"] = asyncio.create_task(_clock_loop())


async def _apply_turn(
    websocket: WebSocket,
    room_id: str,
    cid: str,
    state: Dict[str, Any],
    msg: Dict[str, Any],
    *,
    kind: str,
    fields_ok: bool,
    invalid_detail: str,
    detail_log: str,
    fields: Callable[[str], Dict[str, Any]],
) -> None:
    """Shared handler for turn-consuming actions ("move" and "castle").

    Validates sender/side/turn, settles the clock under the room lock, detects
    time-based game over, applies the increment + seq/turn/clock switch,
    records history, and broadcasts after releasing the lock. `fields(side)`
    supplies the action-specific keys used verbatim in both the history entry
    (after "type") and the broadcast payload (between "by" and
    "measureTargetId"), so client-visible shapes are unchanged.
    """
    m_room = str(msg.get("roomId") or "")
    m_cid = str(msg.get("clientId") or "")
    m_measure_raw = msg.get("measureTargetId")
    m_measure = m_measure_raw if isinstance(m_measure_raw, str) and m_measure_raw else None

    if m_room != room_id or m_cid != cid:
        print(
            f"[WS][{kind}][reject] room_or_client_mismatch room={room_id}/{m_room} cid={cid}/{m_cid}"
        )
        await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
        return

    true_side = service.get_side_for_client(room_id, cid)
    if true_side not in ("white", "black"):
        print(f"[WS][{kind}][reject] unknown_side room={room_id} cid={cid}")
        await _send(websocket, {"type": "error", "detail": "unknown_side"})
        return

    time_over_payload: Optional[Dict[str, Any]] = None
    payload: Optional[Dict[str, Any]] = None

    # Serialize turn/seq/clock updates per room
    async with state["lock"]:
        if state.get("ended"):
            await _send(websocket, {"type": "error", "detail": "game_over"})
            return

        if state["turn"] != true_side:
            print(
                f"[WS][{kind}][reject] not_your_turn room={room_id} cid={cid} side={true_side} turn={state['turn']}"
            )
            await _send(websocket, {"type": "error", "detail": "not_your_turn"})
            return

        if not fields_ok:
            print(
                f"[WS][{kind}][reject] {invalid_detail} room={room_id} cid={cid} {detail_log}"
            )
            await _send(websocket, {"type": "error", "detail": invalid_detail})
            return

        # Settle running clock up to now
        _settle_clock_locked(state)

        # If time is out for either side, end immediately
        clk = state.get("clock", {})
        if bool(clk.get("started")) and (int(clk.get("whiteMs", 0)) <= 0 or int(clk.get("blackMs", 0)) <= 0):
            _end_game_locked(state, "black" if int(clk.get("whiteMs", 0)) <= 0 else "white", "time")
            time_over_payload = _game_over_payload_locked(room_id, state)
        else:
            # Apply increment to the mover
            inc_ms = int(clk.get("incMs", 0))
            if true_side == "white":
                clk["whiteMs"] = max(0, int(clk.get("whiteMs", 0)) + inc_ms)
            else:
                clk["blackMs"] = max(0, int(clk.get("blackMs", 0)) + inc_ms)

            # Update sequence and turn
            state["seq"] += 1
            state["turn"] = _other_side(true_side)

            # The active clock always follows the side to move.
            if not bool(clk.get("started")):
                clk["started"] = True
            clk["active"] = state["turn"]
            clk["lastMono"] = _now_mono()

            state["clock"] = clk

            action_fields = fields(true_side)
            state.setdefault("history", []).append({"type": kind, **action_fields})

            payload = {
                "type": kind,
                "roomId": room_id,
                "by": cid,
                **action_fields,
                "measureTargetId": m_measure,
                "seq": state["seq"],
                "turn": state["turn"],
                "clock": _clock_view(state),
            }
            print(
                f"[WS][{kind}] room={room_id} by={cid} side={true_side} {detail_log} seq={state['seq']} next_turn={state['turn']} conns={list(state['conns'].keys())}"
            )

    if time_over_payload is not None:
        await _publish_game_over(room_id, state, time_over_payload)
        return

    if payload is not None:
        await _broadcast(room_id, payload)


@router.websocket("/ws/{room_id}")
async def matchmaking_ws(
    websocket: WebSocket,
    room_id: str,
    clientId: Optional[str] = Query(default=None),
    ticket: Optional[str] = Query(default=None),
):
    # Reject if no clientId or invalid room
    cid = (clientId or "").strip()
    if not cid or not service.room_exists(room_id) or not service.validate_room_ticket(cid, room_id, ticket):
        try:
            print(
                f"[WS][reject] room={room_id} cid={cid or '<none>'} exists={service.room_exists(room_id)} valid={service.validate_room_ticket(cid, room_id, ticket)}"
            )
        except Exception:
            pass
        await websocket.close(code=4401)
        return

    await websocket.accept()

    # Register connection
    state = _get_room_state(room_id)
    state["room_snapshot"] = service.get_room_snapshot(room_id) or state.get("room_snapshot")

    # Close existing connection for this client if any
    old = state["conns"].get(cid)
    if old is not None:
        try:
            await old.close()
        except Exception:
            pass

    state["conns"][cid] = websocket

    # A returning player is no longer disconnected; two seated players start
    # the first-move countdown.
    state.setdefault("dc_at", {}).pop(cid, None)
    if len(state["conns"]) == 2 and not state.get("both_connected_at"):
        state["both_connected_at"] = _now_mono()

    side = service.get_side_for_client(room_id, cid) or "white"
    room_snapshot = service.get_room_snapshot(room_id) or {"players": [], "sides": {}}
    opponent_present = len(room_snapshot.get("players", [])) == 2

    print(
        f"[WS][connect] room={room_id} cid={cid} side={side} conns={list(state['conns'].keys())} turn={state['turn']} seq={state['seq']}"
    )

    # Kick off periodic clock updates for the room
    await _ensure_clock_task(room_id)

    # Welcome just this client
    await _send(
        websocket,
        {
            "type": "welcome",
            "roomId": room_id,
            "you": {"clientId": cid, "side": side},
            "opponentPresent": opponent_present,
            "turn": state["turn"],
            "seq": state["seq"],
            "clock": _clock_view(state),
            "drawOffer": _draw_offer_view(state),
            # Full move history so a rejoining client can rebuild the game.
            "history": list(state.get("history", [])),
        },
    )

    # Notify room state to everyone
    await _broadcast(
        room_id,
        {
            "type": "room_state",
            "roomId": room_id,
            "players": list(room_snapshot.get("players", [])),
            "sides": dict(room_snapshot.get("sides", {})),
            "connected": list(state["conns"].keys()),
            "turn": state["turn"],
            "seq": state["seq"],
            "clock": _clock_view(state),
            "drawOffer": _draw_offer_view(state),
        },
    )

    try:
        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except Exception:
                await _send(websocket, {"type": "error", "detail": "invalid_json"})
                continue

            mtype = msg.get("type")
            if mtype == "ping":
                # Keep the matchmaking-layer liveness fresh during play so the
                # room survives long games and validates rejoins.
                try:
                    service.heartbeat(cid, ticket)
                except Exception:
                    pass
                # Also return a clock snapshot with pong to help clients sync
                await _send(websocket, {"type": "pong", "clock": _clock_view(state)})
                continue

            if mtype == "move":
                # Expected: { type, roomId, clientId, from, to, side?, enPassant?, measureTargetId? }
                m_from = str(msg.get("from") or "")
                m_to = str(msg.get("to") or "")
                m_en_passant = bool(msg.get("enPassant", False))
                await _apply_turn(
                    websocket,
                    room_id,
                    cid,
                    state,
                    msg,
                    kind="move",
                    fields_ok=bool(m_from and m_to),
                    invalid_detail="invalid_move",
                    detail_log=f"from={m_from} to={m_to}",
                    fields=lambda side: {
                        "from": m_from,
                        "to": m_to,
                        "side": side,
                        "enPassant": m_en_passant,
                    },
                )
                continue

            if mtype == "castle":
                # Expected: { type, roomId, clientId, side?, piece1_from, piece1_to, piece2_from, piece2_to }
                p1f = str(msg.get("piece1_from") or "")
                p1t = str(msg.get("piece1_to") or "")
                p2f = str(msg.get("piece2_from") or "")
                p2t = str(msg.get("piece2_to") or "")
                await _apply_turn(
                    websocket,
                    room_id,
                    cid,
                    state,
                    msg,
                    kind="castle",
                    fields_ok=bool(p1f and p1t and p2f and p2t),
                    invalid_detail="invalid_castle",
                    detail_log=f"p1={p1f}->{p1t} p2={p2f}->{p2t}",
                    fields=lambda side: {
                        "side": side,
                        "piece1_from": p1f,
                        "piece1_to": p1t,
                        "piece2_from": p2f,
                        "piece2_to": p2t,
                    },
                )
                continue

            if mtype == "draw_offer":
                # Non-blocking agreement flow. This state is deliberately
                # independent of turn and ordinary moves do not clear it.
                m_room = str(msg.get("roomId") or "")
                m_cid = str(msg.get("clientId") or "")
                action = str(msg.get("action") or "")
                if m_room != room_id or m_cid != cid:
                    await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
                    continue

                true_side = service.get_side_for_client(room_id, cid)
                draw_payload: Optional[Dict[str, Any]] = None
                over_payload: Optional[Dict[str, Any]] = None
                error: Optional[str] = None
                async with state["lock"]:
                    result = _transition_draw_offer_locked(state, str(true_side or ""), action)
                    error = result.get("error")
                    if not error:
                        if result.get("gameOver"):
                            over_payload = _game_over_payload_locked(room_id, state)
                        else:
                            draw_payload = {
                                "type": "draw_offer",
                                "roomId": room_id,
                                "status": result.get("status"),
                                "offeredBy": result.get("offeredBy"),
                                "resolution": result.get("resolution"),
                                "by": true_side,
                                "seq": state.get("seq", 0),
                            }

                if error:
                    await _send(websocket, {"type": "error", "detail": error})
                elif over_payload is not None:
                    await _publish_game_over(room_id, state, over_payload)
                elif draw_payload is not None:
                    await _broadcast(room_id, draw_payload)
                continue

            if mtype == "game_over":
                # Resignation is inferred from the authenticated seat. Engine
                # endings require matching reports from both deterministic
                # clients; one browser can no longer award itself a win.
                m_room = str(msg.get("roomId") or "")
                m_cid = str(msg.get("clientId") or "")
                if m_room != room_id or m_cid != cid:
                    await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
                    continue

                raw_winner = msg.get("winner")
                report_winner = raw_winner if raw_winner in ("white", "black") else None
                report_reason = str(msg.get("reason") or "rules")[:64]
                if report_reason == "agreement":
                    await _send(websocket, {"type": "error", "detail": "use_draw_offer_protocol"})
                    continue

                over_payload: Optional[Dict[str, Any]] = None
                pending_confirmation = False
                async with state["lock"]:
                    if not state.get("ended"):
                        true_side = service.get_side_for_client(room_id, cid)
                        transition = _transition_terminal_claim_locked(
                            state, str(true_side or ""), report_winner, report_reason
                        )
                        if transition.get("error"):
                            await _send(websocket, {"type": "error", "detail": transition["error"]})
                        elif transition.get("gameOver"):
                            over_payload = _game_over_payload_locked(room_id, state)
                        else:
                            pending_confirmation = bool(transition.get("pending"))
                        print(
                            f"[WS][game_over] room={room_id} by={cid} winner={report_winner} reason={report_reason} pending={pending_confirmation}"
                        )

                if over_payload is not None:
                    await _publish_game_over(room_id, state, over_payload)
                elif pending_confirmation:
                    await _send(websocket, {"type": "game_over_pending", "roomId": room_id})
                continue

            # Unknown message type
            print(f"[WS][unknown] room={room_id} cid={cid} type={mtype}")
            await _send(websocket, {"type": "error", "detail": "unknown_type"})

    except WebSocketDisconnect:
        print(f"[WS][disconnect] room={room_id} cid={cid}")
    except Exception as ex:  # pragma: no cover
        try:
            print(f"[WS][error] room={room_id} cid={cid} ex={ex}")
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
    finally:
        # Cleanup connection and notify room. Only deregister if THIS socket
        # is still the one on record — a client that reconnected (same cid,
        # new socket) must not be kicked when its old socket finishes closing.
        room_state = _WS_ROOMS.get(room_id)
        if room_state and room_state.get("conns", {}).get(cid) is websocket:
            try:
                room_state["conns"].pop(cid, None)
            except Exception:
                pass
            # Start the abandonment countdown for this seat; a rejoin clears it.
            if not room_state.get("ended"):
                room_state.setdefault("dc_at", {})[cid] = _now_mono()
            room_snapshot = service.get_room_snapshot(room_id) or {"players": [], "sides": {}}
            print(
                f"[WS][cleanup] room={room_id} removed={cid} remaining={list(room_state.get('conns', {}).keys())} turn={room_state.get('turn')} seq={room_state.get('seq')}"
            )
            await _broadcast(
                room_id,
                {
                    "type": "room_state",
                    "roomId": room_id,
                    "players": list(room_snapshot.get("players", [])),
                    "sides": dict(room_snapshot.get("sides", {})),
                    "connected": list(room_state.get("conns", {}).keys()),
                    "turn": room_state.get("turn", "white"),
                    "seq": room_state.get("seq", 0),
                    "clock": _clock_view(room_state),
                    "drawOffer": _draw_offer_view(room_state),
                },
            )

        # If no connections remain, stop the clock task if running
        final_state = _WS_ROOMS.get(room_id)
        if final_state and not final_state.get("conns"):
            task = final_state.get("clock_task")
            if task and not task.done():
                try:
                    task.cancel()
                except Exception:
                    pass
            final_state["clock_task"] = None
