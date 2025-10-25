# backend/app/main.py
# Purpose: Define the FastAPI app and configure robust logging. Register a proper ASGI middleware for exception logging using add_middleware so all errors are captured in /logs.
# Imports From: None
# Exported To: ./bootstrap.py
from __future__ import annotations

import datetime
import logging
import logging.config
import os
import sys
import traceback
from typing import Any

import numpy as np
import requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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


# ---- Endpoints ----------------------------------------------------------------
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
