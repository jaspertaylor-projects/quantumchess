# backend/app/stats/sampler.py
# Purpose: Periodically sample matchmaking concurrency and persist snapshots
# to Supabase (qc_stat_snapshots), plus process-lifetime peak tracking that
# /api/matchmaking/metrics exposes. Samples every 20s for peak fidelity but
# writes at most once a minute, and skips writes entirely while the site sits
# at zero (with an hourly heartbeat row so a quiet dashboard still proves the
# sampler is alive).
# Imports From: ./supabase_writer.py, ../matchmaking/service.py
# Exported To: ../main.py (startup task), ../matchmaking/router.py (peaks_view)

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict

from app.matchmaking import service as matchmaking
from . import supabase_writer

_logger = logging.getLogger("uvicorn.error")

SAMPLE_INTERVAL_S = 20.0
WRITE_EVERY_TICKS = 3  # 3 * 20s = one write window per minute
HEARTBEAT_INTERVAL_S = 3600.0

# Process-lifetime peaks (reset on deploy/restart; durable history lives in
# the snapshot table).
_peaks: Dict[str, int] = {"playersOnline": 0, "activeGames": 0}
_peaks_since = time.time()


def observe(metrics: Dict[str, Any]) -> None:
    """Fold one metrics reading into the lifetime peaks."""
    active = int(metrics.get("rooms", 0)) - int(metrics.get("openRooms", 0))
    _peaks["activeGames"] = max(_peaks["activeGames"], active)
    _peaks["playersOnline"] = max(_peaks["playersOnline"], int(metrics.get("playersOnline", 0)))


def peaks_view() -> Dict[str, Any]:
    return {
        "peakPlayersOnline": _peaks["playersOnline"],
        "peakActiveGames": _peaks["activeGames"],
        "peaksSince": _peaks_since,
    }


async def run_sampler() -> None:
    window = {"queued": 0, "rooms": 0, "open_rooms": 0, "active_games": 0, "players_online": 0}
    ticks = 0
    last_write_mono = 0.0
    last_write_nonzero = False

    while True:
        try:
            m = matchmaking.metrics()
            observe(m)
            active = int(m.get("rooms", 0)) - int(m.get("openRooms", 0))
            window["queued"] = max(window["queued"], int(m.get("queued", 0)))
            window["rooms"] = max(window["rooms"], int(m.get("rooms", 0)))
            window["open_rooms"] = max(window["open_rooms"], int(m.get("openRooms", 0)))
            window["active_games"] = max(window["active_games"], active)
            window["players_online"] = max(window["players_online"], int(m.get("playersOnline", 0)))
            ticks += 1

            if ticks >= WRITE_EVERY_TICKS:
                nowm = time.monotonic()
                nonzero = any(window.values())
                due_heartbeat = (nowm - last_write_mono) >= HEARTBEAT_INTERVAL_S
                # Write activity, the first zero after activity (so graphs
                # return to the axis), or the hourly heartbeat.
                if nonzero or last_write_nonzero or due_heartbeat:
                    supabase_writer.insert_row("qc_stat_snapshots", dict(window))
                    last_write_mono = nowm
                    last_write_nonzero = nonzero
                window = dict.fromkeys(window, 0)
                ticks = 0
        except Exception as exc:
            _logger.error("stats sampler tick failed: %s", exc)

        await asyncio.sleep(SAMPLE_INTERVAL_S)
