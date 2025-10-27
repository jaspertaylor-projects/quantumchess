# backend/app/matchmaking/__init__.py
# Purpose: Package initializer for the matchmaking domain. Groups router, models, and service into a cohesive feature module.
# Imports From: .router
# Exported To: app.main

from __future__ import annotations

from .router import router as matchmaking_router  # re-export for convenience

__all__ = ["matchmaking_router"]
