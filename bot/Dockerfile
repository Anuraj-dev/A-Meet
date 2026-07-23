# syntax=docker/dockerfile:1
#
# Production image for the A-Meet Discord bot — a small discord.js process that
# adapts slash commands to the /api/integrations/discord API. No native builds
# (unlike the server's mediasoup), so the image is a plain Node runtime.

# ---- build stage: install the bot workspace from the root lockfile ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Install the bot workspace and its shared-contract dependency from the root
# lockfile. The image build context is the repository root so workspace links
# resolve exactly as they do in CI and local development.
COPY package.json package-lock.json ./
COPY bot/package.json ./bot/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci --omit=dev --workspace bot --ignore-scripts

COPY bot/src ./bot/src
COPY shared/src ./shared/src

# ---- runtime stage: slim image carrying only the built artifacts ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/bot

COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/bot ./
COPY --from=build /app/shared /app/shared
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/package-lock.json /app/package-lock.json

RUN chown -R node:node /app
USER node

# Run through the tsx loader: sources are TypeScript and tsx strips types at load
# time, so the image needs no separate compile step. tsx ships as a runtime
# dependency (kept by --omit=dev).
CMD ["node", "--import", "tsx", "src/index.ts"]
