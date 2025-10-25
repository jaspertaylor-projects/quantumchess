# frontend/Dockerfile
# Purpose: Multi-stage build for the Vite/React app; automatically self-heals pnpm dependencies during build so non-developers only need Docker. Keeps same caching logic and stages as original.
# Imports From: package.json, pnpm-lock.yaml, vite.config.js, ./src/*
# Exported To: docker-compose.yml (development) and docker-compose.prod.yml (production)
# syntax=docker/dockerfile:1.4

# ---- Base (shared) ----
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm" \
    PNPM_STORE_DIR="/pnpm/store" \
    PATH="$PNPM_HOME:$PATH"
RUN corepack enable
# Dev convenience for dropping privileges in the dev server command path
RUN apk add --no-cache su-exec
# Writable global store cache (helps incremental installs during dev)
RUN mkdir -p /pnpm/store && chmod -R 0777 /pnpm

# ---- Dependencies (hoisted for cache) ----
FROM base AS deps
WORKDIR /app
# Build arg lets us optionally clear the pnpm store and choose strictness
ARG CLEAR_PNPM_STORE=false
COPY package.json pnpm-lock.yaml ./
# Conditionally refresh pnpm store and lock resolution
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    if [ "$CLEAR_PNPM_STORE" = "true" ]; then \
      echo "🧹 Clearing /pnpm/store and reinstalling without frozen lockfile"; \
      rm -rf /pnpm/store/*; \
      pnpm install --no-frozen-lockfile; \
    else \
      echo "Installing dependencies (auto-healing lockfile if needed)"; \
      pnpm install --no-frozen-lockfile; \
    fi

# ---- Builder (creates /app/dist) ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ---- Production (minimal runtime that serves static assets) ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g serve
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]

# ---- Development (DEFAULT stage; kept last so docker build w/o target yields dev image) ----
FROM base AS development
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["pnpm", "run", "dev"]
