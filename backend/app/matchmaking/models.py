# backend/app/matchmaking/models.py
# Purpose: Define Pydantic models for the matchmaking API payloads and responses.
# Imports From: None
# Exported To: .router, .service

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class JoinPayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)
    ranked: bool = False


class LeavePayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)


class HeartbeatPayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)


class CreatePrivatePayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)


class JoinPrivatePayload(BaseModel):
    clientId: str = Field(..., min_length=6, max_length=128)
    code: str = Field(..., min_length=4, max_length=16)


class MatchResponse(BaseModel):
    status: str
    roomId: Optional[str] = None
    side: Optional[str] = None
    opponentPresent: Optional[bool] = None
    position: Optional[int] = None
    code: Optional[str] = None  # private-room invite code (challenge a friend)
    ranked: Optional[bool] = None
