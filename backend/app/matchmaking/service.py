# backend/app/matchmaking/service.py
# Purpose: In-memory matchmaking logic, state, and operations. Provides join, status, leave, heartbeat, metrics, and helpers for WebSocket validation and room snapshots.
# Imports From: .models
# Exported To: .router

from __future__ import annotations

import datetime
import functools
import secrets
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

from .models import MatchResponse

# In-memory state (process-local). Ranked and unranked are deliberately
# independent pools: a player can only be paired inside the pool they chose.
_MM_QUEUES: Dict[str, List[str]] = {"unranked": [], "ranked": []}
_MM_CLIENT_QUEUE: Dict[str, str] = {}
_MM_ROOMS: Dict[str, Dict[str, Any]] = {}
_MM_CLIENT_ROOM: Dict[str, str] = {}
_MM_CLIENT_LAST_SEEN: Dict[str, float] = {}
_MM_CLIENT_AUTH: Dict[str, Dict[str, Any]] = {}
_MM_QUEUE_JOINED_AT: Dict[str, float] = {}
_MM_USER_CLIENT: Dict[str, str] = {}
_MM_LOCK = threading.RLock()
_MM_TTL_SECONDS = 120.0

# Ranked searches begin locally, then add 100 Elo every ten seconds. After
# two minutes every normal ladder rating is reachable.
RANKED_INITIAL_RANGE = 100
RANKED_RANGE_STEP = 100
RANKED_RANGE_STEP_SECONDS = 10.0
RANKED_MAX_RANGE = 1200


def _synchronized(fn):
    @functools.wraps(fn)
    def wrapped(*args, **kwargs):
        with _MM_LOCK:
            return fn(*args, **kwargs)
    return wrapped

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
        # Remove stale clients from either matchmaking pool.
        for c in stale_clients:
            _remove_from_queue(c)

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
        if c in stale_clients and c not in _MM_CLIENT_ROOM and c not in _MM_CLIENT_QUEUE:
            _MM_CLIENT_LAST_SEEN.pop(c, None)
            _forget_auth(c)

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


def _begin_op(client_id_raw: str) -> Optional[str]:
    """The shared preamble of every public operation: prune stale state,
    normalize the client id (None when blank), refresh the caller's
    liveness."""
    _cleanup_stale()
    client_id = (client_id_raw or "").strip()
    if not client_id:
        return None
    _touch_client(client_id)
    return client_id


def _queue_name(ranked: bool) -> str:
    return "ranked" if ranked else "unranked"


def _remove_from_queue(client_id: str) -> None:
    queue_name = _MM_CLIENT_QUEUE.pop(client_id, None)
    if queue_name in _MM_QUEUES:
        try:
            _MM_QUEUES[queue_name].remove(client_id)
        except ValueError:
            pass
    _MM_QUEUE_JOINED_AT.pop(client_id, None)


def _forget_auth(client_id: str) -> None:
    auth = _MM_CLIENT_AUTH.pop(client_id, None) or {}
    user_id = auth.get("user_id")
    if user_id and _MM_USER_CLIENT.get(user_id) == client_id:
        _MM_USER_CLIENT.pop(user_id, None)


def _ranked_range(client_id: str) -> int:
    waited = max(0.0, _now() - _MM_QUEUE_JOINED_AT.get(client_id, _now()))
    steps = int(waited // RANKED_RANGE_STEP_SECONDS)
    return min(RANKED_MAX_RANGE, RANKED_INITIAL_RANGE + (steps * RANKED_RANGE_STEP))


def _auth_view(client_id: str) -> Dict[str, Any]:
    return _MM_CLIENT_AUTH.get(client_id, {})


def _ticket_ok(client_id: str, ticket: Optional[str]) -> bool:
    queue_name = _MM_CLIENT_QUEUE.get(client_id)
    room_id = _MM_CLIENT_ROOM.get(client_id)
    room = _MM_ROOMS.get(room_id or "")
    ranked = queue_name == "ranked" or bool(room and room.get("ranked"))
    if not ranked:
        return True
    expected = str(_auth_view(client_id).get("ticket") or "")
    return bool(expected and ticket and secrets.compare_digest(expected, ticket))


def _queued_view(client_id: str) -> MatchResponse:
    queue_name = _MM_CLIENT_QUEUE.get(client_id, "unranked")
    queue = _MM_QUEUES[queue_name]
    return MatchResponse(
        status="queued",
        position=queue.index(client_id) + 1,
        ranked=queue_name == "ranked",
        ticket=_auth_view(client_id).get("ticket"),
        rating=_auth_view(client_id).get("rating"),
    )


def _make_room(
    room_id: str,
    players: List[str],
    sides: Dict[str, str],
    *,
    ranked: bool = False,
) -> Dict[str, Any]:
    return {
        "id": room_id,
        "players": players,
        "sides": sides,
        "ranked": ranked,
        "created_at": time.time(),
        "last_heartbeat": {pid: _now() for pid in players},
        "identities": {pid: dict(_auth_view(pid)) for pid in players if _auth_view(pid)},
    }


def _room_view_for(client_id: str, room: Dict[str, Any]) -> MatchResponse:
    rid = room.get("id")
    players: List[str] = room.get("players", [])
    sides: Dict[str, str] = room.get("sides", {})
    side = sides.get(client_id)
    opponent_present = len(players) == 2
    identity = (room.get("identities") or {}).get(client_id, _auth_view(client_id))
    opponent_id = next((pid for pid in players if pid != client_id), None)
    opponent = (room.get("identities") or {}).get(opponent_id, {}) if opponent_id else {}
    return MatchResponse(
        status="matched", roomId=rid, side=side, opponentPresent=opponent_present,
        ranked=bool(room.get("ranked", False)),
        ticket=identity.get("ticket"),
        rating=identity.get("rating"),
        opponentRating=opponent.get("rating"),
        opponentName=opponent.get("username"),
    )


def _create_match(queue_name: str, partner: str, client_id: str) -> MatchResponse:
    queue = _MM_QUEUES[queue_name]
    for seated_id in (partner, client_id):
        try:
            queue.remove(seated_id)
        except ValueError:
            pass
    _MM_CLIENT_QUEUE.pop(partner, None)
    _MM_CLIENT_QUEUE.pop(client_id, None)
    _MM_QUEUE_JOINED_AT.pop(partner, None)
    _MM_QUEUE_JOINED_AT.pop(client_id, None)

    room_id = uuid.uuid4().hex
    players = [partner, client_id]
    sides = {partner: "white", client_id: "black"}
    room = _make_room(room_id, players, sides, ranked=queue_name == "ranked")
    _MM_ROOMS[room_id] = room
    for pid in players:
        _MM_CLIENT_ROOM[pid] = room_id
    return _room_view_for(client_id, room)


def _try_ranked_match(client_id: str) -> Optional[MatchResponse]:
    if _MM_CLIENT_QUEUE.get(client_id) != "ranked":
        return None
    mine = _auth_view(client_id)
    if not mine:
        return None
    my_rating = int(mine.get("rating", 1200))
    my_user = mine.get("user_id")
    compatible = []
    for queued_id in list(_MM_QUEUES["ranked"]):
        if queued_id == client_id:
            continue
        theirs = _auth_view(queued_id)
        if not theirs or theirs.get("user_id") == my_user:
            continue
        gap = abs(my_rating - int(theirs.get("rating", 1200)))
        if gap <= max(_ranked_range(client_id), _ranked_range(queued_id)):
            compatible.append((gap, _MM_QUEUE_JOINED_AT.get(queued_id, _now()), queued_id))
    if not compatible:
        return None
    compatible.sort()
    return _create_match("ranked", compatible[0][2], client_id)


# Public operations -------------------------------------------------------------

@_synchronized
def join(
    client_id_raw: str,
    ranked: bool = False,
    *,
    identity: Optional[Dict[str, Any]] = None,
) -> MatchResponse:
    client_id = _begin_op(client_id_raw)
    if not client_id:
        return MatchResponse(status="error")

    if ranked:
        user_id = str((identity or {}).get("user_id") or "")
        if not user_id:
            return MatchResponse(status="authentication_required", ranked=True)
        bound_user = str(_auth_view(client_id).get("user_id") or "")
        if bound_user and bound_user != user_id:
            return MatchResponse(status="authentication_required", ranked=True)
        previous_client = _MM_USER_CLIENT.get(user_id)
        if previous_client and previous_client != client_id:
            leave(previous_client, _auth_view(previous_client).get("ticket"))
        current = _auth_view(client_id)
        ticket = current.get("ticket") or secrets.token_urlsafe(32)
        _MM_CLIENT_AUTH[client_id] = {
            "user_id": user_id,
            "username": str((identity or {}).get("username") or "Player")[:80],
            "rating": int((identity or {}).get("rating") or 1200),
            "ticket": ticket,
        }
        _MM_USER_CLIENT[user_id] = client_id
    elif not _ticket_ok(client_id, None):
        # An unauthenticated mode switch must not reveal or evict a ranked
        # seat merely because its browser client id was guessed.
        return MatchResponse(status="authentication_required", ranked=True)

    # Already in a room
    existing_room_id = _MM_CLIENT_ROOM.get(client_id)
    if existing_room_id:
        room = _MM_ROOMS.get(existing_room_id)
        if room:
            return _room_view_for(client_id, room)
        else:
            _MM_CLIENT_ROOM.pop(client_id, None)

    queue_name = _queue_name(ranked)
    queue = _MM_QUEUES[queue_name]

    # An idempotent retry stays in its chosen pool. If the player changed
    # their choice, atomically move them instead of occupying both queues.
    existing_queue = _MM_CLIENT_QUEUE.get(client_id)
    if existing_queue == queue_name and client_id in queue:
        return _queued_view(client_id)
    if existing_queue:
        _remove_from_queue(client_id)

    # Ranked matching uses current ratings and a range that grows with wait.
    if ranked:
        if client_id not in queue:
            queue.append(client_id)
            _MM_CLIENT_QUEUE[client_id] = queue_name
            _MM_QUEUE_JOINED_AT[client_id] = _now()
        matched = _try_ranked_match(client_id)
        return matched or _queued_view(client_id)

    # Unranked remains first-in, first-out.
    partner: Optional[str] = None
    for queued_id in list(queue):
        if queued_id != client_id:
            partner = queued_id
            break

    if partner is None:
        # No partner available; enqueue
        queue.append(client_id)
        _MM_CLIENT_QUEUE[client_id] = queue_name
        _MM_QUEUE_JOINED_AT[client_id] = _now()
        return _queued_view(client_id)

    # Create a room with partner and client
    return _create_match(queue_name, partner, client_id)


@_synchronized
def create_private(client_id_raw: str) -> MatchResponse:
    """Open a private room for the creator (white) and mint an invite code.

    The creator waits in the room; a friend seats themselves with the code
    via join_private. Idempotent: re-creating while already waiting in an
    open private room returns the same room and code.
    """
    client_id = _begin_op(client_id_raw)
    if not client_id:
        return MatchResponse(status="error")
    if not _ticket_ok(client_id, None):
        return MatchResponse(status="authentication_required", ranked=True)

    existing_room_id = _MM_CLIENT_ROOM.get(client_id)
    if existing_room_id:
        room = _MM_ROOMS.get(existing_room_id)
        if room and room.get("code") and room.get("players") == [client_id]:
            return MatchResponse(
                status="waiting", roomId=existing_room_id, side="white",
                opponentPresent=False, code=room["code"],
            )
        # Detach from any other (or dead) room before opening a fresh one.
        leave(client_id, _auth_view(client_id).get("ticket"))

    _remove_from_queue(client_id)

    room_id = uuid.uuid4().hex
    code = _new_invite_code()
    room = _make_room(room_id, [client_id], {client_id: "white"})
    room["code"] = code
    _MM_ROOMS[room_id] = room
    _MM_CLIENT_ROOM[client_id] = room_id
    _MM_INVITES[code] = room_id

    return MatchResponse(
        status="waiting", roomId=room_id, side="white", opponentPresent=False, code=code
    )


@_synchronized
def join_private(client_id_raw: str, code_raw: str) -> MatchResponse:
    """Seat a friend (black) into the private room behind an invite code."""
    client_id = _begin_op(client_id_raw)
    code = (code_raw or "").strip().upper()
    if not client_id or not code:
        return MatchResponse(status="error")
    if not _ticket_ok(client_id, None):
        return MatchResponse(status="authentication_required", ranked=True)

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
    if _MM_CLIENT_ROOM.get(client_id) or client_id in _MM_CLIENT_QUEUE:
        leave(client_id, _auth_view(client_id).get("ticket"))

    players.append(client_id)
    room["players"] = players
    room["sides"][client_id] = "black"
    room.setdefault("last_heartbeat", {})[client_id] = _now()
    _MM_CLIENT_ROOM[client_id] = room_id

    return _room_view_for(client_id, room)


@_synchronized
def get_status(client_id_raw: str, ticket: Optional[str] = None) -> MatchResponse:
    client_id = _begin_op(client_id_raw)
    if not client_id:
        return MatchResponse(status="error")
    if not _ticket_ok(client_id, ticket):
        return MatchResponse(status="authentication_required")

    rid = _MM_CLIENT_ROOM.get(client_id)
    if rid and rid in _MM_ROOMS:
        room = _MM_ROOMS[rid]
        return _room_view_for(client_id, room)

    if client_id in _MM_CLIENT_QUEUE:
        if _MM_CLIENT_QUEUE.get(client_id) == "ranked":
            matched = _try_ranked_match(client_id)
            if matched:
                return matched
        return _queued_view(client_id)

    return MatchResponse(status="idle")


@_synchronized
def leave(client_id_raw: str, ticket: Optional[str] = None) -> Dict[str, Any]:
    client_id = _begin_op(client_id_raw)
    if not client_id:
        return {"status": "error"}
    if not _ticket_ok(client_id, ticket):
        return {"status": "authentication_required"}

    # Remove from queue
    _remove_from_queue(client_id)

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

    _forget_auth(client_id)
    return {"status": "left"}


@_synchronized
def heartbeat(client_id_raw: str, ticket: Optional[str] = None) -> Dict[str, Any]:
    client_id = _begin_op(client_id_raw)
    if not client_id:
        return {"status": "error"}
    if not _ticket_ok(client_id, ticket):
        return {"status": "authentication_required"}

    if _MM_CLIENT_QUEUE.get(client_id) == "ranked":
        matched = _try_ranked_match(client_id)
        if matched:
            return {
                "status": "ok",
                "roomId": matched.roomId,
                "side": matched.side,
                "opponentPresent": matched.opponentPresent,
                "ranked": True,
                "ticket": matched.ticket,
                "opponentRating": matched.opponentRating,
                "opponentName": matched.opponentName,
            }

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
        opponent_id = next((pid for pid in players if pid != client_id), None)
        opponent = (room.get("identities") or {}).get(opponent_id, {}) if opponent_id else {}
        # Include room context so polling clients can fast-path detect a match
        return {
            "status": "ok",
            "roomId": rid,
            "side": side,
            "opponentPresent": opponent_present,
            "ranked": bool(room.get("ranked", False)),
            "ticket": _auth_view(client_id).get("ticket"),
            "opponentRating": opponent.get("rating"),
            "opponentName": opponent.get("username"),
        }

    return {"status": "ok"}


@_synchronized
def metrics() -> Dict[str, Any]:
    _cleanup_stale()
    now = _now()
    online = [c for c, ts in _MM_CLIENT_LAST_SEEN.items() if now - ts <= _MM_TTL_SECONDS]
    rooms_total = len(_MM_ROOMS)
    open_rooms = sum(1 for r in _MM_ROOMS.values() if len(r.get("players", [])) == 1)
    return {
        "queued": sum(len(queue) for queue in _MM_QUEUES.values()),
        "rankedQueued": len(_MM_QUEUES["ranked"]),
        "unrankedQueued": len(_MM_QUEUES["unranked"]),
        "rooms": rooms_total,
        "openRooms": open_rooms,
        "playersOnline": len(set(online)),
        "timestamp": datetime.datetime.now().isoformat(),
    }


# Helper functions for WebSocket layer -----------------------------------------

@_synchronized
def room_exists(room_id: str) -> bool:
    return bool(room_id and room_id in _MM_ROOMS)


@_synchronized
def get_room_snapshot(room_id: str) -> Optional[Dict[str, Any]]:
    room = _MM_ROOMS.get(room_id)
    if not room:
        return None
    return {
        "id": room.get("id"),
        "players": list(room.get("players", [])),
        "sides": dict(room.get("sides", {})),
        "ranked": bool(room.get("ranked", False)),
        "created_at": room.get("created_at"),
        "identities": {
            pid: {
                "user_id": identity.get("user_id"),
                "username": identity.get("username"),
                "rating": identity.get("rating"),
            }
            for pid, identity in (room.get("identities") or {}).items()
        },
    }


@_synchronized
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


@_synchronized
def validate_room_ticket(client_id: str, room_id: str, ticket: Optional[str]) -> bool:
    return validate_client_in_room(client_id, room_id) and _ticket_ok(client_id, ticket)


@_synchronized
def get_side_for_client(room_id: str, client_id: str) -> Optional[str]:
    room = _MM_ROOMS.get(room_id)
    if not room:
        return None
    sides = room.get("sides", {})
    side = sides.get(client_id)
    if side in ("white", "black"):
        return side
    return None
