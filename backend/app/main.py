# backend/app/main.py
# Purpose: Define the FastAPI app, robust logging, exception-logging middleware, CORS, and expose RESTful endpoints including a lightweight in-memory matchmaking service.
# Imports From: None
# Exported To: ./bootstrap.py
from __future__ import annotations

import datetime
import logging
import logging.config
import os
import sys
import time
import traceback
import uuid
from typing import Any, Dict, List, Optional

import numpy as np
import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---- Paths -------------------------------------------------------------------
LOG_DIR = os.getenv("LOG_DIR", "/logs")
BACKEND_ERROR_FILE = os.path.join(LOG_DIR, "backend-error.log")
FRONTEND_ERROR_FILE = os.path.join(LOG_DIR, "frontend-error.log")


# ---- Logging Setup ------------------------------------------------------------
def _ensure_log_dir() -> None:
    try:
        os.makedirs(LOG_DIR, exist_ok=True)
    except Exception:
        pass


def _rotating_file_handler_dict(filename: str, level: str) -> dict[str, Any]:
    return {
        "class": "logging.handlers.RotatingFileHandler",
        "level": level,
        "filename": filename,
        "maxBytes": 5_242_880,
        "backupCount": 5,
        "encoding": "utf-8",
        "formatter": "default",
    }


def configure_logging() -> None:
    _ensure_log_dir()

    config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "format": "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
                "datefmt": "%Y-%m-%dT%H:%M:%S%z",
            }
        },
        "handlers": {
            "backend_file": _rotating_file_handler_dict(BACKEND_ERROR_FILE, "ERROR"),
            "frontend_file": _rotating_file_handler_dict(FRONTEND_ERROR_FILE, "ERROR"),
        },
        "loggers": {
            "uvicorn": {
                "level": "ERROR",
                "handlers": ["backend_file"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": "ERROR",
                "handlers": ["backend_file"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "ERROR",
                "handlers": ["backend_file"],
                "propagate": False,
            },
            "fastapi": {
                "level": "ERROR",
                "handlers": ["backend_file"],
                "propagate": False,
            },
            "frontend.client": {
                "level": "ERROR",
                "handlers": ["frontend_file"],
                "propagate": False,
            },
        },
        "root": {"level": "ERROR", "handlers": ["backend_file"]},
    }

    # Avoid duplicated handlers in reload scenarios.
    for name in (
        "",
        "uvicorn",
        "uvicorn.error",
        "uvicorn.access",
        "fastapi",
        "frontend.client",
    ):
        logger = logging.getLogger(name)
        logger.handlers.clear()

    logging.config.dictConfig(config)

    # Ensure log files exist so they can be tailed immediately.
    try:
        for f in (BACKEND_ERROR_FILE, FRONTEND_ERROR_FILE):
            if not os.path.exists(f):
                with open(f, "a", encoding="utf-8"):
                    pass
    except Exception:
        pass

    def _excepthook(exc_type, exc, tb):
        logger = logging.getLogger("uvicorn.error")
        logger.error(
            "Uncaught exception\n%s",
            "".join(traceback.format_exception(exc_type, exc, tb)),
        )

    sys.excepthook = _excepthook  # type: ignore[assignment]


configure_logging()


# ---- FastAPI App --------------------------------------------------------------
app = FastAPI()


# ---- Exception Logging Middleware (ASGI) --------------------------------------
class ExceptionLoggingMiddleware:
    # Purpose: Capture any unhandled exceptions during request handling and log them with path and client IP.
    # Imports From: None
    # Exported To: FastAPI app via add_middleware
    def __init__(self, app: FastAPI):
        self.app = app
        self.logger = logging.getLogger("uvicorn.error")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        try:
            return await self.app(scope, receive, send)
        except Exception:
            path = scope.get("path")
            client = scope.get("client")
            client_ip = (
                client[0] if isinstance(client, (tuple, list)) and client else None
            )
            self.logger.exception(
                "Unhandled exception | path=%s | ip=%s", path, client_ip
            )
            raise


# Register logging middleware first so it wraps the entire stack.
app.add_middleware(ExceptionLoggingMiddleware)

# CORS should come after logging so CORS errors are captured too.
origins = [
    "http://localhost",
    "http://localhost:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Endpoints: Health --------------------------------------------------------
@app.get("/api/hello")
def read_root() -> dict[str, Any]:
    return {
        "message": "Hello from the FastAPI & Docker Coming in Hot and fresh and tasty today!!!",
        "timestamp": datetime.datetime.now().isoformat(),
    }


@app.get("/api/external-data")
def get_external_data() -> dict[str, Any]:
    try:
        response = requests.get(
            "https://jsonplaceholder.typicode.com/todos/1", timeout=5
        )
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.json()
    except requests.exceptions.RequestException as e:
        # Log the error and return a user-friendly message
        logging.getLogger("fastapi").error("Failed to fetch external data: %s", e)
        return {"error": "Failed to fetch data from external service."}


# ---- Frontend Error Intake ----------------------------------------------------
class FrontendErrorPayload(BaseModel):
    message: str
    stack: str | None = None
    source: str | None = None
    line: int | None = None
    col: int | None = None
    href: str | None = None
    userAgent: str | None = None


@app.post("/api/logs/frontend")
def log_frontend_error(
    payload: FrontendErrorPayload, request: Request
) -> dict[str, str]:
    client_ip = request.client.host if request.client else None
    logger = logging.getLogger("frontend.client")
    logger.error(
        "FrontendError | ip=%s | message=%s | source=%s | line=%s | col=%s | href=%s | userAgent=%s | stack=%s",
        client_ip,
        payload.message,
        payload.source,
        payload.line,
        payload.col,
        payload.href,
        payload.userAgent,
        payload.stack,
    )
    return {"status": "ok"}


# ---- Matchmaking Service ------------------------------------------------------
# Lightweight in-memory queue that pairs the first two distinct players into a room.
# Ensures a client is never in two rooms simultaneously. Provides status, join, leave,
# heartbeat, and metrics endpoints. This is best-effort and process-local by design.

class JoinPayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)


class LeavePayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)


class HeartbeatPayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)


class MatchResponse(BaseModel):
    status: str
    roomId: Optional[str] = None
    side: Optional[str] = None
    opponentPresent: Optional[bool] = None
    position: Optional[int] = None


_MM_QUEUE: List[str] = []
_MM_ROOMS: Dict[str, Dict[str, Any]] = {}
_MM_CLIENT_ROOM: Dict[str, str] = {}
_MM_CLIENT_LAST_SEEN: Dict[str, float] = {}
_MM_TTL_SECONDS = 120.0


def _now() -> float:
    return time.monotonic()


def _cleanup_stale() -> None:
    now = _now()
    # Drop stale queued clients
    stale_clients = set()
    for c in list(_MM_CLIENT_LAST_SEEN.keys()):
        if now - _MM_CLIENT_LAST_SEEN.get(c, now) > _MM_TTL_SECONDS:
            stale_clients.add(c)
    if stale_clients:
        # Remove from queue
        for c in list(_MM_QUEUE):
            if c in stale_clients:
                try:
                    _MM_QUEUE.remove(c)
                except ValueError:
                    pass
        # Remove from rooms
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
    # Prune unknown last_seen
    for c in list(_MM_CLIENT_LAST_SEEN.keys()):
        if c in stale_clients and c not in _MM_CLIENT_ROOM and c not in _MM_QUEUE:
            _MM_CLIENT_LAST_SEEN.pop(c, None)


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


@app.post("/api/matchmaking/join", response_model=MatchResponse)
def matchmaking_join(payload: JoinPayload) -> MatchResponse:
    _cleanup_stale()
    client_id = payload.clientId.strip()
    if not client_id:
        return MatchResponse(status="error")

    _touch_client(client_id)

    # If already in a room, return room info
    existing_room_id = _MM_CLIENT_ROOM.get(client_id)
    if existing_room_id:
        room = _MM_ROOMS.get(existing_room_id)
        if room:
            return _room_view_for(client_id, room)
        else:
            _MM_CLIENT_ROOM.pop(client_id, None)

    # If already queued, return queued position
    if client_id in _MM_QUEUE:
        pos = _MM_QUEUE.index(client_id) + 1
        return MatchResponse(status="queued", position=pos)

    # Try to match with the earliest waiting player
    partner: Optional[str] = None
    for queued_id in list(_MM_QUEUE):
        if queued_id != client_id:
            partner = queued_id
            break

    if partner is None:
        # No partner; enqueue
        _MM_QUEUE.append(client_id)
        pos = _MM_QUEUE.index(client_id) + 1
        return MatchResponse(status="queued", position=pos)

    # Dequeue partner and create room
    try:
        _MM_QUEUE.remove(partner)
    except ValueError:
        pass

    room_id = uuid.uuid4().hex
    # First queued player gets White, joiner gets Black for determinism
    players = [partner, client_id]
    sides = {partner: "white", client_id: "black"}
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


@app.get("/api/matchmaking/status/{client_id}", response_model=MatchResponse)
def matchmaking_status(client_id: str) -> MatchResponse:
    _cleanup_stale()
    client_id = (client_id or "").strip()
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


@app.post("/api/matchmaking/leave")
def matchmaking_leave(payload: LeavePayload) -> Dict[str, Any]:
    _cleanup_stale()
    client_id = payload.clientId.strip()
    if not client_id:
        return {"status": "error"}

    _touch_client(client_id)

    # Remove from queue
    try:
        if client_id in _MM_QUEUE:
            _MM_QUEUE.remove(client_id)
    except ValueError:
        pass

    # Remove from room
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
            # If empty, destroy room
            if not players:
                _MM_ROOMS.pop(rid, None)

    return {"status": "left"}


@app.post("/api/matchmaking/heartbeat")
def matchmaking_heartbeat(payload: HeartbeatPayload) -> Dict[str, Any]:
    _cleanup_stale()
    client_id = payload.clientId.strip()
    if not client_id:
        return {"status": "error"}

    _touch_client(client_id)

    rid = _MM_CLIENT_ROOM.get(client_id)
    if rid and rid in _MM_ROOMS:
        room = _MM_ROOMS[rid]
        hb = room.get("last_heartbeat", {})
        hb[client_id] = _now()
        room["last_heartbeat"] = hb
        return {"status": "ok", "roomId": rid}

    return {"status": "ok"}


@app.get("/api/matchmaking/metrics")
def matchmaking_metrics() -> Dict[str, Any]:
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
