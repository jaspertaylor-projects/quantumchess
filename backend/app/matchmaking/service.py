# backend/app/matchmaking/service.py
# Purpose: In-memory matchmaking logic, state, and operations. Provides join, status, leave, heartbeat, metrics, and helpers for WebSocket validation and room snapshots.
# Imports From: .models
# Exported To: .router

from __future__ import annotations

import datetime
import secrets
import time
import uuid
from typing import Any, Dict, List, Optional

from .models import MatchResponse

# In-memory state (process-local)
_MM_QUEUE: List[str] = []
_MM_ROOMS: Dict[str, Dict[str, Any]] = {}
_MM_CLIENT_ROOM: Dict[str, str] = {}
_MM_CLIENT_LAST_SEEN: Dict[str, float] = {}
_MM_TTL_SECONDS = 120.0

# Private "challenge a friend" rooms: shareable code -> room id. Codes use an
# unambiguous alphabet (no 0/O/1/I/L) so they survive being read aloud.
_MM_INVITES: Dict[str, str] = {}
_INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_INVITE_CODE_LEN = 6


def _now() -> float:
    return time.monotonic()


def _cleanup_stale() -> None:
    now = _now()

    # Find stale clients by last seen time
    stale_clients = set()
    for c in list(_MM_CLIENT_LAST_SEEN.keys()):
        if now - _MM_CLIENT_LAST_SEEN.get(c, now) > _MM_TTL_SECONDS:
            stale_clients.add(c)

    if stale_clients:
        # Remove stale clients from queue
        for c in list(_MM_QUEUE):
            if c in stale_clients:
                try:
                    _MM_QUEUE.remove(c)
                except ValueError:
                    pass

        # Remove stale clients from rooms; drop empty rooms
        for rid, room in list(_MM_ROOMS.items()):
            players = room.get("players", [])
            changed = False
            for c in list(players):
                if c in stale_clients:
                    try:
                        players.remove(c)
                        changed = True
                        _MM_CLIENT_ROOM.pop(c, None)
                    except ValueError:
                        pass
            if changed:
                room["players"] = players
            if not players:
                _MM_ROOMS.pop(rid, None)

    # Prune unknown last_seen entries for fully removed clients
    for c in list(_MM_CLIENT_LAST_SEEN.keys()):
        if c in stale_clients and c not in _MM_CLIENT_ROOM and c not in _MM_QUEUE:
            _MM_CLIENT_LAST_SEEN.pop(c, None)

    # Drop invite codes whose room is gone
    for code, rid in list(_MM_INVITES.items()):
        if rid not in _MM_ROOMS:
            _MM_INVITES.pop(code, None)


def _new_invite_code() -> str:
    while True:
        code = "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(_INVITE_CODE_LEN))
        if code not in _MM_INVITES:
            return code


def _touch_client(client_id: str) -> None:
    _MM_CLIENT_LAST_SEEN[client_id] = _now()


def _room_view_for(client_id: str, room: Dict[str, Any]) -> MatchResponse:
    rid = room.get("id")
    players: List[str] = room.get("players", [])
    sides: Dict[str, str] = room.get("sides", {})
    side = sides.get(client_id)
    opponent_present = len(players) == 2
    return MatchResponse(
        status="matched", roomId=rid, side=side, opponentPresent=opponent_present
    )


# Public operations -------------------------------------------------------------

def join(client_id_raw: str) -> MatchResponse:
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    if not client_id:
        return MatchResponse(status="error")

    _touch_client(client_id)

    # Already in a room
    existing_room_id = _MM_CLIENT_ROOM.get(client_id)
    if existing_room_id:
        room = _MM_ROOMS.get(existing_room_id)
        if room:
            return _room_view_for(client_id, room)
        else:
            _MM_CLIENT_ROOM.pop(client_id, None)

    # Already queued
    if client_id in _MM_QUEUE:
        pos = _MM_QUEUE.index(client_id) + 1
        return MatchResponse(status="queued", position=pos)

    # Try to match with earliest waiting distinct player
    partner: Optional[str] = None
    for queued_id in list(_MM_QUEUE):
        if queued_id != client_id:
            partner = queued_id
            break

    if partner is None:
        # No partner available; enqueue
        _MM_QUEUE.append(client_id)
        pos = _MM_QUEUE.index(client_id) + 1
        return MatchResponse(status="queued", position=pos)

    # Create a room with partner and client
    try:
        _MM_QUEUE.remove(partner)
    except ValueError:
        pass

    room_id = uuid.uuid4().hex
    players = [partner, client_id]
    sides = {partner: "white", client_id: "black"}  # deterministic assignment
    room = {
        "id": room_id,
        "players": players,
        "sides": sides,
        "created_at": time.time(),
        "last_heartbeat": {partner: _now(), client_id: _now()},
    }
    _MM_ROOMS[room_id] = room
    for pid in players:
        _MM_CLIENT_ROOM[pid] = room_id

    return _room_view_for(client_id, room)


def create_private(client_id_raw: str) -> MatchResponse:
    """Open a private room for the creator (white) and mint an invite code.

    The creator waits in the room; a friend seats themselves with the code
    via join_private. Idempotent: re-creating while already waiting in an
    open private room returns the same room and code.
    """
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    if not client_id:
        return MatchResponse(status="error")

    _touch_client(client_id)

    existing_room_id = _MM_CLIENT_ROOM.get(client_id)
    if existing_room_id:
        room = _MM_ROOMS.get(existing_room_id)
        if room and room.get("code") and room.get("players") == [client_id]:
            return MatchResponse(
                status="waiting", roomId=existing_room_id, side="white",
                opponentPresent=False, code=room["code"],
            )
        # Detach from any other (or dead) room before opening a fresh one.
        leave(client_id)

    if client_id in _MM_QUEUE:
        try:
            _MM_QUEUE.remove(client_id)
        except ValueError:
            pass

    room_id = uuid.uuid4().hex
    code = _new_invite_code()
    room = {
        "id": room_id,
        "players": [client_id],
        "sides": {client_id: "white"},
        "created_at": time.time(),
        "last_heartbeat": {client_id: _now()},
        "code": code,
    }
    _MM_ROOMS[room_id] = room
    _MM_CLIENT_ROOM[client_id] = room_id
    _MM_INVITES[code] = room_id

    return MatchResponse(
        status="waiting", roomId=room_id, side="white", opponentPresent=False, code=code
    )


def join_private(client_id_raw: str, code_raw: str) -> MatchResponse:
    """Seat a friend (black) into the private room behind an invite code."""
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    code = (code_raw or "").strip().upper()
    if not client_id or not code:
        return MatchResponse(status="error")

    _touch_client(client_id)

    room_id = _MM_INVITES.get(code)
    room = _MM_ROOMS.get(room_id) if room_id else None
    if not room:
        return MatchResponse(status="not_found")

    players: List[str] = room.get("players", [])
    if client_id in players:
        return _room_view_for(client_id, room)  # idempotent rejoin
    if len(players) >= 2:
        return MatchResponse(status="room_full")

    # Detach the joiner from any previous queue spot or room.
    if _MM_CLIENT_ROOM.get(client_id) or client_id in _MM_QUEUE:
        leave(client_id)

    players.append(client_id)
    room["players"] = players
    room["sides"][client_id] = "black"
    room.setdefault("last_heartbeat", {})[client_id] = _now()
    _MM_CLIENT_ROOM[client_id] = room_id

    return _room_view_for(client_id, room)


def get_status(client_id_raw: str) -> MatchResponse:
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    if not client_id:
        return MatchResponse(status="error")

    _touch_client(client_id)

    rid = _MM_CLIENT_ROOM.get(client_id)
    if rid and rid in _MM_ROOMS:
        room = _MM_ROOMS[rid]
        return _room_view_for(client_id, room)

    if client_id in _MM_QUEUE:
        pos = _MM_QUEUE.index(client_id) + 1
        return MatchResponse(status="queued", position=pos)

    return MatchResponse(status="idle")


def leave(client_id_raw: str) -> Dict[str, Any]:
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    if not client_id:
        return {"status": "error"}

    _touch_client(client_id)

    # Remove from queue
    try:
        if client_id in _MM_QUEUE:
            _MM_QUEUE.remove(client_id)
    except ValueError:
        pass

    # Remove from room and drop empty rooms
    rid = _MM_CLIENT_ROOM.pop(client_id, None)
    if rid and rid in _MM_ROOMS:
        room = _MM_ROOMS.get(rid)
        if room:
            players = room.get("players", [])
            if client_id in players:
                try:
                    players.remove(client_id)
                except ValueError:
                    pass
                room["players"] = players
            if not players:
                _MM_ROOMS.pop(rid, None)

    return {"status": "left"}


def heartbeat(client_id_raw: str) -> Dict[str, Any]:
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    if not client_id:
        return {"status": "error"}

    _touch_client(client_id)

    rid = _MM_CLIENT_ROOM.get(client_id)
    if rid and rid in _MM_ROOMS:
        room = _MM_ROOMS[rid]
        hb = room.get("last_heartbeat", {})
        hb[client_id] = _now()
        room["last_heartbeat"] = hb
        players = room.get("players", [])
        sides = room.get("sides", {})
        side = sides.get(client_id)
        opponent_present = len(players) == 2
        # Include room context so polling clients can fast-path detect a match
        return {
            "status": "ok",
            "roomId": rid,
            "side": side,
            "opponentPresent": opponent_present,
        }

    return {"status": "ok"}


def metrics() -> Dict[str, Any]:
    _cleanup_stale()
    now = _now()
    online = [c for c, ts in _MM_CLIENT_LAST_SEEN.items() if now - ts <= _MM_TTL_SECONDS]
    rooms_total = len(_MM_ROOMS)
    open_rooms = sum(1 for r in _MM_ROOMS.values() if len(r.get("players", [])) == 1)
    return {
        "queued": len(_MM_QUEUE),
        "rooms": rooms_total,
        "openRooms": open_rooms,
        "playersOnline": len(set(online)),
        "timestamp": datetime.datetime.now().isoformat(),
    }


# Helper functions for WebSocket layer -----------------------------------------

def room_exists(room_id: str) -> bool:
    return bool(room_id and room_id in _MM_ROOMS)


def get_room_snapshot(room_id: str) -> Optional[Dict[str, Any]]:
    room = _MM_ROOMS.get(room_id)
    if not room:
        return None
    return {
        "id": room.get("id"),
        "players": list(room.get("players", [])),
        "sides": dict(room.get("sides", {})),
        "created_at": room.get("created_at"),
    }


def validate_client_in_room(client_id: str, room_id: str) -> bool:
    if not client_id or not room_id:
        return False
    rid = _MM_CLIENT_ROOM.get(client_id)
    if not rid or rid != room_id:
        return False
    if room_id not in _MM_ROOMS:
        return False
    room = _MM_ROOMS[room_id]
    return client_id in room.get("players", [])


def get_side_for_client(room_id: str, client_id: str) -> Optional[str]:
    room = _MM_ROOMS.get(room_id)
    if not room:
        return None
    sides = room.get("sides", {})
    side = sides.get(client_id)
    if side in ("white", "black"):
        return side
    return None
