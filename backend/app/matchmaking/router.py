# backend/app/matchmaking/router.py
# Purpose: FastAPI router exposing RESTful matchmaking endpoints and a WebSocket endpoint to relay real-time game events and authoritative server-side chess clock state per room.
# Imports From: .models, .service
# Exported To: app.main

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from . import service
from .models import HeartbeatPayload, JoinPayload, LeavePayload, MatchResponse

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])  # noqa: E231


@router.post("/join", response_model=MatchResponse)
def matchmaking_join(payload: JoinPayload) -> MatchResponse:
    return service.join(payload.clientId)


@router.get("/status/{client_id}", response_model=MatchResponse)
def matchmaking_status(client_id: str) -> MatchResponse:
    return service.get_status(client_id)


@router.post("/leave")
def matchmaking_leave(payload: LeavePayload) -> Dict[str, Any]:
    return service.leave(payload.clientId)


@router.post("/heartbeat")
def matchmaking_heartbeat(payload: HeartbeatPayload) -> Dict[str, Any]:
    return service.heartbeat(payload.clientId)


@router.get("/metrics")
def matchmaking_metrics() -> Dict[str, Any]:
    return service.metrics()


# ------------------------------ WebSocket Game Relay ---------------------------

# In-memory ephemeral WS connections per room
# { room_id: { "conns": { clientId: WebSocket }, "turn": "white"|"black", "seq": int, "lock": asyncio.Lock,
#              "clock": { "baseMs": int, "incMs": int, "whiteMs": int, "blackMs": int, "active": str,
#                         "lastMono": float, "started": bool }, "clock_task": asyncio.Task|None,
#              "ended": bool, "winner": str|None, "end_reason": str|None, "announced_end": bool } }
_WS_ROOMS: Dict[str, Dict[str, Any]] = {}


def _other_side(side: str) -> str:
    return "black" if side == "white" else "white"


def _now_mono() -> float:
    return time.monotonic()


def _get_room_state(room_id: str) -> Dict[str, Any]:
    s = _WS_ROOMS.setdefault(
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
        },
    )
    if "conns" not in s:
        s["conns"] = {}
    if "turn" not in s:
        s["turn"] = "white"
    if "seq" not in s:
        s["seq"] = 0
    if "lock" not in s or not isinstance(s.get("lock"), asyncio.Lock):
        s["lock"] = asyncio.Lock()
    if "ended" not in s:
        s["ended"] = False
    if "winner" not in s:
        s["winner"] = None
    if "end_reason" not in s:
        s["end_reason"] = None
    if "announced_end" not in s:
        s["announced_end"] = False
    _ensure_clock(s)
    return s


def _ensure_clock(state: Dict[str, Any]) -> None:
    if "clock" not in state or not isinstance(state.get("clock"), dict):
        # Default to 5+0 control. Single source of truth on the server.
        state["clock"] = {
            "baseMs": 5 * 60 * 1000,
            "incMs": 0,
            "whiteMs": 5 * 60 * 1000,
            "blackMs": 5 * 60 * 1000,
            "active": "none",  # "white" | "black" | "none"
            "lastMono": _now_mono(),
            "started": False,
        }
    if "clock_task" not in state:
        state["clock_task"] = None


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
                            s["ended"] = True
                            s["winner"] = "black"
                            s["end_reason"] = "time"
                            clk["active"] = "none"
                        elif int(clk.get("blackMs", 0)) <= 0:
                            s["ended"] = True
                            s["winner"] = "white"
                            s["end_reason"] = "time"
                            clk["active"] = "none"
                        s["clock"] = clk

                    if s.get("ended") and s.get("end_reason") == "time" and not s.get("announced_end"):
                        s["announced_end"] = True
                        game_over_payload = {
                            "type": "game_over",
                            "roomId": room_id,
                            "reason": "time",
                            "winner": s.get("winner"),
                            "seq": s.get("seq", 0),
                            "turn": s.get("turn", "white"),
                            "clock": _clock_view(s),
                        }

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
                    await _broadcast(room_id, game_over_payload)
                else:
                    await _broadcast(room_id, clock_payload)
        except Exception as ex:
            try:
                print(f"[WS][clock][task_error] room={room_id} ex={ex}")
            except Exception:
                pass

    state["clock_task"] = asyncio.create_task(_clock_loop())


@router.websocket("/ws/{room_id}")
async def matchmaking_ws(
    websocket: WebSocket, room_id: str, clientId: Optional[str] = Query(default=None)
):
    # Reject if no clientId or invalid room
    cid = (clientId or "").strip()
    if not cid or not service.room_exists(room_id) or not service.validate_client_in_room(cid, room_id):
        try:
            print(
                f"[WS][reject] room={room_id} cid={cid or '<none>'} exists={service.room_exists(room_id)} valid={service.validate_client_in_room(cid, room_id)}"
            )
        except Exception:
            pass
        await websocket.close(code=4401)
        return

    await websocket.accept()

    # Register connection
    state = _get_room_state(room_id)

    # Close existing connection for this client if any
    old = state["conns"].get(cid)
    if old is not None:
        try:
            await old.close()
        except Exception:
            pass

    state["conns"][cid] = websocket

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
                # Also return a clock snapshot with pong to help clients sync
                await _send(websocket, {"type": "pong", "clock": _clock_view(state)})
                continue

            if mtype == "move":
                # Expected: { type, roomId, clientId, from, to, side? }
                m_room = str(msg.get("roomId") or "")
                m_cid = str(msg.get("clientId") or "")
                m_from = str(msg.get("from") or "")
                m_to = str(msg.get("to") or "")

                if m_room != room_id or m_cid != cid:
                    print(
                        f"[WS][move][reject] room_or_client_mismatch room={room_id}/{m_room} cid={cid}/{m_cid}"
                    )
                    await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
                    continue

                true_side = service.get_side_for_client(room_id, cid)
                if true_side not in ("white", "black"):
                    print(f"[WS][move][reject] unknown_side room={room_id} cid={cid}")
                    await _send(websocket, {"type": "error", "detail": "unknown_side"})
                    continue

                # Serialize turn/seq/clock updates per room
                async with state["lock"]:
                    if state.get("ended"):
                        await _send(websocket, {"type": "error", "detail": "game_over"})
                        continue

                    if state["turn"] != true_side:
                        print(
                            f"[WS][move][reject] not_your_turn room={room_id} cid={cid} side={true_side} turn={state['turn']}"
                        )
                        await _send(websocket, {"type": "error", "detail": "not_your_turn"})
                        continue

                    if not m_from or not m_to:
                        print(
                            f"[WS][move][reject] invalid_move room={room_id} cid={cid} from={m_from} to={m_to}"
                        )
                        await _send(websocket, {"type": "error", "detail": "invalid_move"})
                        continue

                    # Settle running clock up to now
                    _settle_clock_locked(state)

                    # If time is out for either side, end immediately
                    clk = state.get("clock", {})
                    time_over_payload: Optional[Dict[str, Any]] = None
                    if bool(clk.get("started")) and (int(clk.get("whiteMs", 0)) <= 0 or int(clk.get("blackMs", 0)) <= 0):
                        if int(clk.get("whiteMs", 0)) <= 0:
                            state["winner"] = "black"
                        else:
                            state["winner"] = "white"
                        state["ended"] = True
                        state["end_reason"] = "time"
                        clk["active"] = "none"
                        state["clock"] = clk
                        if not state.get("announced_end"):
                            state["announced_end"] = True
                            time_over_payload = {
                                "type": "game_over",
                                "roomId": room_id,
                                "reason": "time",
                                "winner": state.get("winner"),
                                "seq": state.get("seq", 0),
                                "turn": state.get("turn", "white"),
                                "clock": _clock_view(state),
                            }

                    if time_over_payload is not None:
                        pass  # Will broadcast after releasing lock and skip applying move
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

                        # Start white's clock after the first move only, otherwise run normal (active = side to move)
                        if not bool(clk.get("started")):
                            clk["started"] = True
                            clk["active"] = "white"
                            clk["lastMono"] = _now_mono()
                        else:
                            # Active clock follows the side to move for subsequent moves
                            clk["active"] = state["turn"]
                            clk["lastMono"] = _now_mono()

                        state["clock"] = clk

                        payload = {
                            "type": "move",
                            "roomId": room_id,
                            "by": cid,
                            "from": m_from,
                            "to": m_to,
                            "side": true_side,
                            "seq": state["seq"],
                            "turn": state["turn"],
                            "clock": _clock_view(state),
                        }
                        print(
                            f"[WS][move] room={room_id} by={cid} side={true_side} from={m_from} to={m_to} seq={state['seq']} next_turn={state['turn']} conns={list(state['conns'].keys())}"
                        )

                if 'time_over_payload' in locals() and time_over_payload is not None:
                    await _broadcast(room_id, time_over_payload)
                    continue

                await _broadcast(room_id, payload)
                continue

            if mtype == "castle":
                # Expected: { type, roomId, clientId, side?, piece1_from, piece1_to, piece2_from, piece2_to }
                m_room = str(msg.get("roomId") or "")
                m_cid = str(msg.get("clientId") or "")
                p1f = str(msg.get("piece1_from") or "")
                p1t = str(msg.get("piece1_to") or "")
                p2f = str(msg.get("piece2_from") or "")
                p2t = str(msg.get("piece2_to") or "")

                if m_room != room_id or m_cid != cid:
                    print(
                        f"[WS][castle][reject] room_or_client_mismatch room={room_id}/{m_room} cid={cid}/{m_cid}"
                    )
                    await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
                    continue

                true_side = service.get_side_for_client(room_id, cid)
                if true_side not in ("white", "black"):
                    print(f"[WS][castle][reject] unknown_side room={room_id} cid={cid}")
                    await _send(websocket, {"type": "error", "detail": "unknown_side"})
                    continue

                time_over_payload_castle: Optional[Dict[str, Any]] = None
                async with state["lock"]:
                    if state.get("ended"):
                        await _send(websocket, {"type": "error", "detail": "game_over"})
                        continue

                    if state["turn"] != true_side:
                        print(
                            f"[WS][castle][reject] not_your_turn room={room_id} cid={cid} side={true_side} turn={state['turn']}"
                        )
                        await _send(websocket, {"type": "error", "detail": "not_your_turn"})
                        continue

                    if not (p1f and p1t and p2f and p2t):
                        print(
                            f"[WS][castle][reject] invalid_castle room={room_id} cid={cid} p1={p1f}->{p1t} p2={p2f}->{p2t}"
                        )
                        await _send(websocket, {"type": "error", "detail": "invalid_castle"})
                        continue

                    # Settle clock then check time-based end before applying increment and turn switch
                    _settle_clock_locked(state)
                    clk = state.get("clock", {})
                    if bool(clk.get("started")) and (int(clk.get("whiteMs", 0)) <= 0 or int(clk.get("blackMs", 0)) <= 0):
                        if int(clk.get("whiteMs", 0)) <= 0:
                            state["winner"] = "black"
                        else:
                            state["winner"] = "white"
                        state["ended"] = True
                        state["end_reason"] = "time"
                        clk["active"] = "none"
                        state["clock"] = clk
                        if not state.get("announced_end"):
                            state["announced_end"] = True
                            time_over_payload_castle = {
                                "type": "game_over",
                                "roomId": room_id,
                                "reason": "time",
                                "winner": state.get("winner"),
                                "seq": state.get("seq", 0),
                                "turn": state.get("turn", "white"),
                                "clock": _clock_view(state),
                            }
                    else:
                        inc_ms = int(clk.get("incMs", 0))
                        if true_side == "white":
                            clk["whiteMs"] = max(0, int(clk.get("whiteMs", 0)) + inc_ms)
                        else:
                            clk["blackMs"] = max(0, int(clk.get("blackMs", 0)) + inc_ms)

                        state["seq"] += 1
                        state["turn"] = _other_side(true_side)

                        if not bool(clk.get("started")):
                            clk["started"] = True
                            clk["active"] = "white"
                            clk["lastMono"] = _now_mono()
                        else:
                            clk["active"] = state["turn"]
                            clk["lastMono"] = _now_mono()

                        state["clock"] = clk

                        payload = {
                            "type": "castle",
                            "roomId": room_id,
                            "by": cid,
                            "side": true_side,
                            "piece1_from": p1f,
                            "piece1_to": p1t,
                            "piece2_from": p2f,
                            "piece2_to": p2t,
                            "seq": state["seq"],
                            "turn": state["turn"],
                            "clock": _clock_view(state),
                        }
                        print(
                            f"[WS][castle] room={room_id} by={cid} side={true_side} p1={p1f}->{p1t} p2={p2f}->{p2t} seq={state['seq']} next_turn={state['turn']} conns={list(state['conns'].keys())}"
                        )

                if time_over_payload_castle is not None:
                    await _broadcast(room_id, time_over_payload_castle)
                    continue

                await _broadcast(room_id, payload)
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
        # Cleanup connection and notify room
        room_state = _WS_ROOMS.get(room_id)
        if room_state and cid in room_state.get("conns", {}):
            try:
                room_state["conns"].pop(cid, None)
            except Exception:
                pass
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
