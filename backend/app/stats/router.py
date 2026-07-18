# backend/app/stats/router.py
# Purpose: Client-facing stats intake — the bot-game-finished ping (bot games
# run entirely in the browser, so the server only learns about them from this
# best-effort, unauthenticated report). Values are whitelisted/clamped and the
# endpoint is rate limited per IP, but bot counts remain approximate by design.
# Imports From: ./supabase_writer.py
# Exported To: ../main.py

from __future__ import annotations

import time
from typing import Dict, Optional, Tuple

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from . import supabase_writer

router = APIRouter(prefix="/api/stats", tags=["stats"])

_RESULTS = {"win", "loss", "draw", "unknown"}

# clientIp -> (window start, count); 10 pings / minute is far above any real
# player's finish rate.
_rate: Dict[str, Tuple[float, int]] = {}
_RATE_WINDOW_S = 60.0
_RATE_MAX = 10


class BotGameFinishedPayload(BaseModel):
    result: str = "unknown"
    endReason: str = ""
    moveCount: int = 0
    botId: str = ""
    botTier: str = ""


def _clean(value: str, cap: int = 40) -> Optional[str]:
    text = (value or "").strip()[:cap]
    return text or None


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    start, count = _rate.get(ip, (now, 0))
    if now - start > _RATE_WINDOW_S:
        start, count = now, 0
    count += 1
    _rate[ip] = (start, count)
    if len(_rate) > 10000:  # keep the map bounded against IP churn
        _rate.clear()
    return count > _RATE_MAX


@router.post("/game-finished", status_code=204)
def stats_game_finished(payload: BotGameFinishedPayload, request: Request) -> Response:
    ip = request.client.host if request.client else ""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        ip = forwarded.split(",")[0].strip() or ip
    if _rate_limited(ip):
        return Response(status_code=429)

    supabase_writer.insert_row(
        "qc_finished_games",
        {
            "mode": "bot",
            "result": payload.result if payload.result in _RESULTS else "unknown",
            "end_reason": _clean(payload.endReason),
            "move_count": max(0, min(int(payload.moveCount), 2000)),
            "bot_id": _clean(payload.botId),
            "bot_tier": _clean(payload.botTier),
        },
    )
    return Response(status_code=204)
