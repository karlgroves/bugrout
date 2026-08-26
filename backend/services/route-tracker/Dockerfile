# Build context is the REPOSITORY ROOT, not this directory.
#
# route-tracker imports @bugrout/worker-utils (a workspace package), so the
# build needs to see the workspace. `flyctl deploy` is invoked from the repo
# root with --config/--dockerfile pointing here; see backend-deploy.yml.
#
# syntax=docker/dockerfile:1

FROM node:22-slim AS builder
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Manifests and the lockfile first, so the install layer caches on dependency
# changes rather than on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/worker-utils/package.json packages/worker-utils/
COPY backend/services/route-tracker/package.json backend/services/route-tracker/

# --frozen-lockfile: resolve exactly what the committed lockfile pins. The old
# `npm install` with no lockfile in the context meant the deployed image's
# dependency tree was whatever npm happened to resolve at build time — a tree
# no scanner in this repo had ever audited.
RUN pnpm install --frozen-lockfile --filter @bugrout/route-tracker...

COPY tsconfig.base.json ./
COPY packages/worker-utils/ packages/worker-utils/
COPY backend/services/route-tracker/ backend/services/route-tracker/

RUN pnpm --filter @bugrout/route-tracker run build

# esbuild bundles the app, the workspace package AND ioredis into one file, so
# the runtime image needs no node_modules at all.
#
# This deliberately avoids `pnpm deploy`, which re-resolves the workspace rather
# than reusing the frozen install above. Two things went wrong with it: pnpm 10
# refuses it outright without inject-workspace-packages, and with --legacy it
# re-resolved every root devDependency and was then blocked by the
# trustPolicy: no-downgrade set in #80 — a supply-chain check firing on
# eslint-plugin-import, which has nothing to do with this service's runtime.
# Bundling sidesteps all of it and produces a smaller image.

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/backend/services/route-tracker/dist ./dist
COPY --from=builder /app/backend/services/route-tracker/package.json ./
EXPOSE 8080
USER node

# CKV_DOCKER_2 — the service already exposes /health; this makes the container
# runtime aware of it. `node -e` rather than curl, because the slim image has
# no HTTP client and adding one to satisfy a health check would be a strictly
# larger attack surface than the check removes.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["node", "dist/index.js"]
