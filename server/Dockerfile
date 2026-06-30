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

# Install the server workspace and its shared-contract dependency from the root
# lockfile. The image build context is the repository root so workspace links
# resolve exactly as they do in CI and local development.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --omit=dev --workspace server

COPY server/src ./server/src
COPY shared/src ./shared/src

# ---- runtime stage: slim image carrying only the built artifacts ----
# Must match the build stage's major (Node 22) so the runtime satisfies the
# mediasoup engine constraint that the worker was built against.
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/server

# The mediasoup-worker binary is dynamically linked against libstdc++, which is
# already present in the bookworm-slim base — so we can ship without the toolchain.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/server ./
COPY --from=build /app/shared /app/shared
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json

# Logger appends to ./logs/server.log; create it and hand ownership to the
# unprivileged runtime user. Mount a volume here in prod to persist/tail logs.
RUN mkdir -p logs && chown -R node:node /app
USER node

# HTTP/Socket.io API port. The mediasoup UDP/TCP RTC range is published via host
# networking at run time, so it is not (and cannot usefully be) EXPOSEd here.
EXPOSE 5000

# Run through the tsx loader: the server sources are TypeScript (with some .js
# still mid-migration) and tsx strips types at load time, so the image needs no
# separate compile step. tsx ships as a runtime dependency (kept by --omit=dev).
CMD ["node", "--import", "tsx", "src/server.ts"]

# ---- smoke stage: exercise the actual runtime so a bad runtime fails the build ----
# Build with `docker build --target smoke ...` (see CI). This spawns a real
# mediasoup worker on the runtime image: it would fail on an unsupported Node
# (EBADENGINE) or a worker binary that can't run, instead of shipping silently.
FROM runtime AS smoke
RUN node --input-type=module -e "import * as mediasoup from 'mediasoup'; const worker = await mediasoup.createWorker(); console.log('smoke: mediasoup worker started, pid', worker.pid); worker.close();"
