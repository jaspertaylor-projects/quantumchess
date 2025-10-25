# backend/Dockerfile
# Purpose: Containerize the FastAPI backend on Python 3.12 to satisfy pyproject's requires-python (>=3.12) while preventing uv from auto-downloading newer interpreters (e.g., 3.14) that lack prebuilt wheels for uvicorn[standard] extras like httptools.
# Imports From: ./pyproject.toml, ./uv.lock, ./app/*, ./uvicorn-log.json
# Exported To: docker-compose.yml services: backend; DigitalOcean App Platform service: backend.

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    LOG_DIR=/logs \
    UV_PYTHON_PREFERENCE=only-system

# Install uv and curl
RUN pip install --no-cache-dir uv && \
    apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Non-root runtime user
ARG UID=1000
ARG GID=1000
RUN groupadd -g "${GID}" app && useradd -m -u "${UID}" -g "${GID}" app

WORKDIR /app

# Copy project metadata first to maximize layer caching
COPY pyproject.toml uv.lock* ./

# Prepare logs dir and ownership before switching users
RUN mkdir -p "${LOG_DIR}" && chown -R app:app "${LOG_DIR}" /app

USER app

# Create venv pinned to the system Python 3.12 and install deps (frozen when possible)
# Forcing 'only-system' ensures uv does not fetch CPython 3.14+ which would reintroduce source builds.
RUN uv venv --python=/usr/local/bin/python3.12 && uv sync --frozen --python-preference=only-system

# Bring in application code and logging config
COPY --chown=app:app ./app ./app
COPY --chown=app:app uvicorn-log.json ./uvicorn-log.json

EXPOSE 8000

# Production command (dev compose overrides with --reload)
CMD ["uv", "run", "uvicorn", "app.bootstrap:asgi", "--host", "0.0.0.0", "--port", "8000", "--log-config", "/app/uvicorn-log.json"]
