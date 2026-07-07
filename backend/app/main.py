# backend/app/main.py
# Purpose: Define the FastAPI app, robust logging, exception-logging middleware, CORS, and expose RESTful endpoints. Matchmaking endpoints are mounted from the matchmaking feature module.
# Imports From: app.matchmaking.router
# Exported To: ./bootstrap.py
from __future__ import annotations

import datetime
import logging
import logging.config
import os
import smtplib
import sys
import threading
import time
import traceback
import uuid
from email.message import EmailMessage
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


# ---- Error Alert Emails (SES SMTP) --------------------------------------------
class ThrottledEmailAlertHandler(logging.Handler):
    # Purpose: Email ERROR-level log records to the operator via SES SMTP so
    # production failures page someone instead of rotting in /logs on the box.
    # Throttled: at most one email per QC_ALERT_MIN_INTERVAL_SECONDS; errors in
    # between are counted and summarized in the next email. Disabled unless
    # QC_ALERT_SMTP_USER, QC_ALERT_SMTP_PASS, and QC_ALERT_TO are all set.
    # Sending happens on a daemon thread and never raises into the app.
    # Imports From: None
    # Exported To: attached to the error loggers in configure_alerting()

    def __init__(self) -> None:
        super().__init__(level=logging.ERROR)
        self.host = os.getenv("QC_ALERT_SMTP_HOST", "email-smtp.us-east-1.amazonaws.com")
        self.port = int(os.getenv("QC_ALERT_SMTP_PORT", "587"))
        self.user = os.getenv("QC_ALERT_SMTP_USER", "")
        self.password = os.getenv("QC_ALERT_SMTP_PASS", "")
        self.to_addr = os.getenv("QC_ALERT_TO", "")
        self.from_addr = os.getenv("QC_ALERT_FROM", "noreply@quantumchess.ninja")
        self.min_interval = int(os.getenv("QC_ALERT_MIN_INTERVAL_SECONDS", "900"))
        self.enabled = bool(self.user and self.password and self.to_addr)
        self._lock = threading.Lock()
        self._last_sent = 0.0
        self._suppressed = 0

    def emit(self, record: logging.LogRecord) -> None:
        if not self.enabled:
            return
        try:
            with self._lock:
                now = time.time()
                if now - self._last_sent < self.min_interval:
                    self._suppressed += 1
                    return
                suppressed = self._suppressed
                self._suppressed = 0
                self._last_sent = now
            body = self.format(record)
            threading.Thread(
                target=self._send, args=(record.name, body, suppressed), daemon=True
            ).start()
        except Exception:
            pass  # alerting must never take the app down with it

    def _send(self, logger_name: str, body: str, suppressed: int) -> None:
        try:
            msg = EmailMessage()
            msg["Subject"] = f"[quantumchess] {logger_name} error" + (
                f" (+{suppressed} more since last alert)" if suppressed else ""
            )
            msg["From"] = self.from_addr
            msg["To"] = self.to_addr
            note = (
                f"{suppressed} earlier error(s) were suppressed by the "
                f"{self.min_interval}s throttle since the last alert.\n\n"
                if suppressed
                else ""
            )
            msg.set_content(
                f"{note}{body}\n\nFull logs: /logs on the API box "
                "(docker volume api_logs)."
            )
            with smtplib.SMTP(self.host, self.port, timeout=15) as smtp:
                smtp.starttls()
                smtp.login(self.user, self.password)
                smtp.send_message(msg)
        except Exception as exc:  # pragma: no cover - network failure path
            print(f"[alerts] failed to send error email: {exc}", file=sys.stderr)


def configure_alerting() -> None:
    handler = ThrottledEmailAlertHandler()
    if not handler.enabled:
        return
    handler.setFormatter(
        logging.Formatter(
            "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    )
    # The error loggers don't propagate to root, so attach to each directly.
    for name in ("", "uvicorn", "uvicorn.error", "uvicorn.access", "fastapi", "frontend.client"):
        logging.getLogger(name).addHandler(handler)


configure_logging()
configure_alerting()


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


# ---- Include Matchmaking Router ----------------------------------------------
from app.matchmaking.router import router as matchmaking_router

app.include_router(matchmaking_router)


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
