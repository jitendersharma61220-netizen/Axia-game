# Build from the repo root:  docker build -f apps/web/Dockerfile .
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /app
# NEXT_PUBLIC_* values and the /api rewrite target are baked in at build time.
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ARG API_URL=http://api:4000
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_PUBLIC_ALLOW_DEV_LOGIN=false \
    API_URL=$API_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@axia/web..."
COPY packages/engine packages/engine
COPY apps/web apps/web
RUN pnpm --filter @axia/engine build && pnpm --filter @axia/web build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
