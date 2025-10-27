# backend/app/matchmaking/router.py
# Purpose: FastAPI router exposing RESTful matchmaking endpoints, delegating to the service layer.
# Imports From: .models, .service
# Exported To: app.main

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter

from .models import HeartbeatPayload, JoinPayload, LeavePayload, MatchResponse
from . import service

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])


@router.post("/join", response_model=MatchResponse)
def matchmaking_join(payload: JoinPayload) -> MatchResponse:
    return service.join(payload.clientId)


@router.get("/status/{client_id}", response_model=MatchResponse)
def matchmaking_status(client_id: str) -> MatchResponse:
    return service.get_status(client_id)


@router.post("/leave")
def matchmaking_leave(payload: LeavePayload) -> Dict[str, Any]:
    return service.leave(payload.clientId)


@router.post("/heartbeat")
def matchmaking_heartbeat(payload: HeartbeatPayload) -> Dict[str, Any]:
    return service.heartbeat(payload.clientId)


@router.get("/metrics")
def matchmaking_metrics() -> Dict[str, Any]:
    return service.metrics()
