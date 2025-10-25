# backend/app/bootstrap.py
# Purpose: Import wrapper that persistently logs startup import errors to logs/backend-error.log AND wraps the ASGI app to accept POST /api/client-error, appending browser runtime errors to logs/frontend-error.log with light rate limiting and size caps.
# Imports From: backend/app/main.py
# Exported To: Uvicorn entrypoint "app.bootstrap:asgi"

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import traceback
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any, Dict, Tuple, Optional, Callable

LOG_DIR = os.getenv("LOG_DIR", "logs")
BACKEND_ERR_FILE = os.path.join(LOG_DIR, "backend-error.log")
FRONTEND_ERR_FILE = os.path.join(LOG_DIR, "frontend-error.log")


def _ensure_bootstrap_logger() -> logging.Logger:
    os.makedirs(LOG_DIR, exist_ok=True)
    logger = logging.getLogger("bootstrap")
    if not logger.handlers:
        handler = RotatingFileHandler(
            BACKEND_ERR_FILE,
            maxBytes=5_242_880,
            backupCount=5,
            encoding="utf-8",
        )
        formatter = logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            "%Y-%m-%dT%H:%M:%S%z",
        )
        handler.setFormatter(formatter)
        handler.setLevel(logging.ERROR)
        logger.addHandler(handler)
        logger.setLevel(logging.ERROR)
        logger.propagate = False
    return logger


_bootstrap_logger = _ensure_bootstrap_logger()


def _safe_trunc(s: Any, n: int = 2000) -> str:
    try:
        text = str(s)
    except Exception:
        text = repr(s)
    if len(text) > n:
        return text[: n - 1] + "…"
    return text


def _headers_to_dict(raw_headers: Any) -> Dict[str, str]:
    try:
        return {k.decode("latin1").lower(): v.decode("latin1") for k, v in raw_headers or []}
    except Exception:
        return {}


class _ClientErrorProxy:
    """
    Minimal ASGI wrapper that intercepts POST /api/client-error and appends a JSON line
    to logs/frontend-error.log. Keeps things dependency-free and avoids touching app.main.
    """

    def __init__(self, app: Callable, log_dir: str = LOG_DIR) -> None:
        self.app = app
        self.log_dir = log_dir
        os.makedirs(self.log_dir, exist_ok=True)
        self.out_path = Path(self.log_dir) / "frontend-error.log"
        # rate limiting: max 20 events / 10s per ip
        self._rate: Dict[str, Tuple[float, int]] = {}
        self._rate_window = 10.0
        self._rate_max = 20
        # simple dedupe: 5s ttl for exact same signature
        self._dedupe: Dict[str, float] = {}
        self._dedupe_ttl = 5.0

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        path = scope.get("path") or ""
        method = (scope.get("method") or "GET").upper()
        if path != "/api/client-error" or method != "POST":
            return await self.app(scope, receive, send)

        # Read body with cap
        body = b""
        too_large = False
        max_len = 64 * 1024
        while True:
            message = await receive()
            body += message.get("body", b"")
            if len(body) > max_len:
                too_large = True
                break
            if not message.get("more_body"):
                break

        # Prepare helpers to send responses
        async def _respond(status_code: int, payload: Optional[dict] = None):
            headers = [(b"content-type", b"application/json")]
            await send({"type": "http.response.start", "status": status_code, "headers": headers})
            if payload is None:
                await send({"type": "http.response.body", "body": b""})
            else:
                await send({"type": "http.response.body", "body": json.dumps(payload).encode("utf-8")})

        if too_large:
            return await _respond(413, {"detail": "payload too large"})

        # Basic content-type check
        headers = _headers_to_dict(scope.get("headers"))
        ctype = headers.get("content-type", "")
        if "application/json" not in ctype:
            return await _respond(415, {"detail": "unsupported media type"})

        try:
            data = json.loads(body.decode("utf-8", errors="ignore"))
            if not isinstance(data, dict):
                raise ValueError("expected object")
        except Exception:
            return await _respond(400, {"detail": "invalid json"})

        # Rate limit per IP
        client_ip = ""
        if scope.get("client"):
            try:
                client_ip = str(scope["client"][0])
            except Exception:
                client_ip = ""
        xfwd = headers.get("x-forwarded-for", "")
        if xfwd:
            client_ip = xfwd.split(",")[0].strip() or client_ip

        now = time.monotonic()
        win_ts, cnt = self._rate.get(client_ip, (now, 0))
        if now - win_ts > self._rate_window:
            win_ts, cnt = now, 0
        cnt += 1
        self._rate[client_ip] = (win_ts, cnt)
        if cnt > self._rate_max:
            return await _respond(429, {"detail": "rate limited"})

        # Normalize payload
        message = _safe_trunc(data.get("message"))
        stack = _safe_trunc(data.get("stack"))
        source = _safe_trunc(data.get("source"))
        url = _safe_trunc(data.get("url"))
        ua = _safe_trunc(data.get("userAgent"))
        component_stack = _safe_trunc(data.get("componentStack"))
        severity = _safe_trunc(data.get("severity") or "error")
        try:
            line = int(data.get("line") or 0)
        except Exception:
            line = 0
        try:
            col = int(data.get("col") or 0)
        except Exception:
            col = 0

        # Dedupe exact signature briefly
        sig = f"{message}|{stack}|{source}|{line}|{col}"
        exp = self._dedupe.get(sig)
        if exp and exp > now:
            return await _respond(204)
        self._dedupe[sig] = now + self._dedupe_ttl

        record = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "origin": "browser",
            "ip": client_ip,
            "userAgent": ua,
            "url": url,
            "severity": severity,
            "message": message,
            "stack": stack,
            "source": source,
            "line": line,
            "col": col,
            "componentStack": component_stack,
        }

        try:
            with self.out_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
        except Exception:
            # Best-effort; do not fail the app if logging fails
            pass

        return await _respond(204)


# Try importing the real ASGI app and wrap it.
try:
    from app.main import app as asgi  # type: ignore[attr-defined]
    asgi = _ClientErrorProxy(asgi, LOG_DIR)
except Exception:
    _bootstrap_logger.error(
        "Failed to import application module 'app.main:app'. Traceback follows:\n%s",
        traceback.format_exc(),
    )
    raise
