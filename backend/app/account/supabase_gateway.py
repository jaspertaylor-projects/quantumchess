# Purpose: Validate Supabase sessions and perform authoritative ranked-match
# reads/writes with the backend's service-role credentials.

from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional

_logger = logging.getLogger("uvicorn.error")

SUPABASE_URL = (os.getenv("QC_SUPABASE_URL", "") or "").rstrip("/")
SERVICE_KEY = os.getenv("QC_SUPABASE_SERVICE_KEY", "") or ""

_AUTH_CACHE_TTL_S = 45.0
_auth_cache: Dict[str, tuple[float, Dict[str, Any]]] = {}
_cache_lock = threading.Lock()


class AccountServiceUnavailable(RuntimeError):
    pass


class InvalidAccessToken(RuntimeError):
    pass


def enabled() -> bool:
    return bool(SUPABASE_URL and SERVICE_KEY)


def _request_json(
    path: str,
    *,
    method: str = "GET",
    bearer: Optional[str] = None,
    body: Optional[Dict[str, Any]] = None,
    prefer: Optional[str] = None,
) -> Any:
    if not enabled():
        raise AccountServiceUnavailable("Ranked accounts are not configured on this server.")
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {bearer or SERVICE_KEY}",
        "Accept": "application/json",
    }
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}", data=data, headers=headers, method=method
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read()
            return json.loads(raw.decode("utf-8")) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        if exc.code in (401, 403):
            raise InvalidAccessToken("Your session is no longer valid.") from exc
        _logger.error("Supabase request %s failed: HTTP %s %s", path, exc.code, detail)
        raise AccountServiceUnavailable("The ranked account service is temporarily unavailable.") from exc
    except (OSError, TimeoutError, ValueError) as exc:
        _logger.error("Supabase request %s failed: %s", path, exc)
        raise AccountServiceUnavailable("The ranked account service is temporarily unavailable.") from exc


def authenticate_player(access_token: str) -> Dict[str, Any]:
    """Validate a Supabase access token and return the current ladder profile."""
    token = (access_token or "").strip()
    if not token:
        raise InvalidAccessToken("Sign in to join ranked matchmaking.")

    now = time.monotonic()
    with _cache_lock:
        cached = _auth_cache.get(token)
        if cached and cached[0] > now:
            return dict(cached[1])

    user = _request_json("/auth/v1/user", bearer=token)
    user_id = str((user or {}).get("id") or "")
    if not user_id:
        raise InvalidAccessToken("Your session is no longer valid.")

    encoded_id = urllib.parse.quote(user_id, safe="")
    rows = _request_json(
        f"/rest/v1/qc_profiles?id=eq.{encoded_id}&select=id,username,rating&limit=1"
    )
    if not isinstance(rows, list) or not rows:
        raise AccountServiceUnavailable("Your player profile is not ready yet.")
    row = rows[0]
    identity = {
        "user_id": user_id,
        "username": str(row.get("username") or "Player")[:80],
        "rating": int(row.get("rating") or 1200),
    }
    with _cache_lock:
        _auth_cache[token] = (now + _AUTH_CACHE_TTL_S, identity)
        if len(_auth_cache) > 1000:
            expired = [key for key, value in _auth_cache.items() if value[0] <= now]
            for key in expired:
                _auth_cache.pop(key, None)
    return dict(identity)


def finalize_ranked_match(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Invoke the atomic database function that records a match and Elo."""
    result = _request_json(
        "/rest/v1/rpc/qc_finalize_ranked_match",
        method="POST",
        body=payload,
        prefer="return=representation",
    )
    if isinstance(result, list):
        result = result[0] if result else {}
    return result if isinstance(result, dict) else {}
