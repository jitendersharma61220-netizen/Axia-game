# Build from the repo root:  docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/api/package.json apps/api/
# The API's postinstall runs `prisma generate`, which needs the schema.
COPY apps/api/prisma apps/api/prisma
RUN pnpm install --frozen-lockfile --filter "@axia/api..."
COPY packages/engine packages/engine
COPY apps/api apps/api
RUN pnpm --filter @axia/engine build && pnpm --filter @axia/api build

FROM base AS runtime
ENV NODE_ENV=production
# Keep the full workspace (incl. dev tools like tsx) so the seed script can run in the container.
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. Safe to run on every boot.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/main.js"]
