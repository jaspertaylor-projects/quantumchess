# backend/app/matchmaking/router.py
# Purpose: FastAPI router exposing RESTful matchmaking endpoints, delegating to the service layer, and a WebSocket endpoint to relay real-time game events between matched players.
# Imports From: .models, .service
# Exported To: app.main

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from .models import HeartbeatPayload, JoinPayload, LeavePayload, MatchResponse
from . import service

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])


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
# { room_id: { "conns": { clientId: WebSocket }, "turn": "white"|"black", "seq": int } }
_WS_ROOMS: Dict[str, Dict[str, Any]] = {}


def _other_side(side: str) -> str:
    return "black" if side == "white" else "white"


def _get_room_state(room_id: str) -> Dict[str, Any]:
    s = _WS_ROOMS.setdefault(room_id, {"conns": {}, "turn": "white", "seq": 0})
    if "conns" not in s:
        s["conns"] = {}
    if "turn" not in s:
        s["turn"] = "white"
    if "seq" not in s:
        s["seq"] = 0
    return s


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
        return
    text = json.dumps(payload)
    for ws in conns:
        try:
            await ws.send_text(text)
        except Exception:
            # Ignore per-socket failures
            continue


@router.websocket("/ws/{room_id}")
async def matchmaking_ws(websocket: WebSocket, room_id: str, clientId: Optional[str] = Query(default=None)):
    # Reject if no clientId or invalid room
    cid = (clientId or "").strip()
    if not cid or not service.room_exists(room_id) or not service.validate_client_in_room(cid, room_id):
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
                await _send(websocket, {"type": "pong"})
                continue

            if mtype == "move":
                # Expected: { type, roomId, clientId, from, to, side }
                m_room = str(msg.get("roomId") or "")
                m_cid = str(msg.get("clientId") or "")
                m_from = str(msg.get("from") or "")
                m_to = str(msg.get("to") or "")
                m_side = str(msg.get("side") or "")
                if m_room != room_id or m_cid != cid:
                    await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
                    continue
                # Basic checks: client must own the side and it must be their turn
                true_side = service.get_side_for_client(room_id, cid)
                if m_side not in ("white", "black") or m_side != true_side:
                    await _send(websocket, {"type": "error", "detail": "side_mismatch"})
                    continue
                if state["turn"] != m_side:
                    await _send(websocket, {"type": "error", "detail": "not_your_turn"})
                    continue
                if not m_from or not m_to:
                    await _send(websocket, {"type": "error", "detail": "invalid_move"})
                    continue
                # Accept and broadcast
                state["seq"] += 1
                state["turn"] = _other_side(m_side)
                payload = {
                    "type": "move",
                    "roomId": room_id,
                    "by": cid,
                    "from": m_from,
                    "to": m_to,
                    "side": m_side,
                    "seq": state["seq"],
                    "turn": state["turn"],
                }
                await _broadcast(room_id, payload)
                continue

            if mtype == "castle":
                # Expected: { type, roomId, clientId, side, piece1_from, piece1_to, piece2_from, piece2_to }
                m_room = str(msg.get("roomId") or "")
                m_cid = str(msg.get("clientId") or "")
                m_side = str(msg.get("side") or "")
                p1f = str(msg.get("piece1_from") or "")
                p1t = str(msg.get("piece1_to") or "")
                p2f = str(msg.get("piece2_from") or "")
                p2t = str(msg.get("piece2_to") or "")
                if m_room != room_id or m_cid != cid:
                    await _send(websocket, {"type": "error", "detail": "room_or_client_mismatch"})
                    continue
                true_side = service.get_side_for_client(room_id, cid)
                if m_side not in ("white", "black") or m_side != true_side:
                    await _send(websocket, {"type": "error", "detail": "side_mismatch"})
                    continue
                if state["turn"] != m_side:
                    await _send(websocket, {"type": "error", "detail": "not_your_turn"})
                    continue
                if not (p1f and p1t and p2f and p2t):
                    await _send(websocket, {"type": "error", "detail": "invalid_castle"})
                    continue
                state["seq"] += 1
                state["turn"] = _other_side(m_side)
                payload = {
                    "type": "castle",
                    "roomId": room_id,
                    "by": cid,
                    "side": m_side,
                    "piece1_from": p1f,
                    "piece1_to": p1t,
                    "piece2_from": p2f,
                    "piece2_to": p2t,
                    "seq": state["seq"],
                    "turn": state["turn"],
                }
                await _broadcast(room_id, payload)
                continue

            # Unknown message type
            await _send(websocket, {"type": "error", "detail": "unknown_type"})

    except WebSocketDisconnect:
        pass
    except Exception:
        # Any other error ends the connection
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
                },
            )
