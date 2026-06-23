# syntax=docker/dockerfile:1
#
# Production image for the A-Meet backend (Express + Socket.io + mediasoup SFU).
# Built as an immutable artifact so production runs the exact bytes we tested,
# replacing the hand-prepared pm2-on-EC2 box. Run it with host networking so
# mediasoup's RTP port range is reachable (see docker-compose.prod.yml).

# ---- build stage: install deps; mediasoup compiles its C++ worker here ----
# Node 22: mediasoup@3.20 declares "engines": { "node": ">=22" }; on Node 20 npm
# only warns (EBADENGINE) but ships an unsupported runtime, so we pin 22 here.
FROM node:22-bookworm AS build
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
# Must match the build stage's major (Node 22) so the runtime satisfies the
# mediasoup engine constraint that the worker was built against.
FROM node:22-bookworm-slim AS runtime
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

# ---- smoke stage: exercise the actual runtime so a bad runtime fails the build ----
# Build with `docker build --target smoke ...` (see CI). This spawns a real
# mediasoup worker on the runtime image: it would fail on an unsupported Node
# (EBADENGINE) or a worker binary that can't run, instead of shipping silently.
FROM runtime AS smoke
RUN node --input-type=module -e "import * as mediasoup from 'mediasoup'; const worker = await mediasoup.createWorker(); console.log('smoke: mediasoup worker started, pid', worker.pid); worker.close();"
