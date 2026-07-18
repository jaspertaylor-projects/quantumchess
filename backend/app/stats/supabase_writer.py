# backend/app/stats/supabase_writer.py
# Purpose: Fire-and-forget inserts into Supabase (PostgREST) with the service
# role key. Stdlib-only (urllib on a daemon thread) so the backend keeps its
# zero-HTTP-client dependency footprint. Disabled unless QC_SUPABASE_URL and
# QC_SUPABASE_SERVICE_KEY are both set; failures are logged, never raised.
# Imports From: None
# Exported To: ./sampler.py, ./router.py, ../matchmaking/router.py

from __future__ import annotations

import json
import logging
import os
import threading
import urllib.request
from typing import Any, Dict

_logger = logging.getLogger("uvicorn.error")

SUPABASE_URL = (os.getenv("QC_SUPABASE_URL", "") or "").rstrip("/")
SERVICE_KEY = os.getenv("QC_SUPABASE_SERVICE_KEY", "") or ""


def enabled() -> bool:
    return bool(SUPABASE_URL and SERVICE_KEY)


def _post(table: str, row: Dict[str, Any]) -> None:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{table}",
        data=json.dumps(row).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status not in (200, 201, 204):
                _logger.error("stats insert into %s got HTTP %s", table, resp.status)
    except Exception as exc:
        # Stats must never take gameplay down with them.
        _logger.error("stats insert into %s failed: %s", table, exc)


def insert_row(table: str, row: Dict[str, Any]) -> None:
    """Queue one insert on a daemon thread; no-op when unconfigured."""
    if not enabled():
        return
    threading.Thread(target=_post, args=(table, row), daemon=True).start()
