# syntax=docker/dockerfile:1
#
# Production image for the A-Meet backend (Express + Socket.io + mediasoup SFU).
# Built as an immutable artifact so production runs the exact bytes we tested,
# replacing the hand-prepared pm2-on-EC2 box. Run it with host networking so
# mediasoup's RTP port range is reachable (see docker-compose.prod.yml).

# ---- build stage: install deps; mediasoup compiles its C++ worker here ----
FROM node:20-bookworm AS build
WORKDIR /app

# mediasoup builds (or falls back to building) its worker from source on install,
# which needs python3 + a C/C++ toolchain. These stay in the build stage only.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip build-essential \
    && rm -rf /var/lib/apt/lists/*
ENV PYTHON=/usr/bin/python3

# Install against the lockfile first for cache-friendly, reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# ---- runtime stage: slim image carrying only the built artifacts ----
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The mediasoup-worker binary is dynamically linked against libstdc++, which is
# already present in the bookworm-slim base — so we can ship without the toolchain.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/src ./src
COPY package.json package-lock.json ./

# Logger appends to ./logs/server.log; create it and hand ownership to the
# unprivileged runtime user. Mount a volume here in prod to persist/tail logs.
RUN mkdir -p logs && chown -R node:node /app
USER node

# HTTP/Socket.io API port. The mediasoup UDP/TCP RTC range is published via host
# networking at run time, so it is not (and cannot usefully be) EXPOSEd here.
EXPOSE 5000

CMD ["node", "src/server.js"]
