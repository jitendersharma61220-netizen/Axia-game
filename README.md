# Axia — Skill-Game Platform

Short skill games with daily challenges, leaderboards, and "challenge a friend" sharing. Games are **driven by config, not hard-coded**: difficulty, timings, content pools, attempts, availability, and challenges are all changed from the admin panel and take effect on the next game, with no redeploy.

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 15 + Tailwind: the player site and the `/admin` control center, with Phaser game scenes |
| `apps/api` | NestJS 11 + Prisma (PostgreSQL) + Redis: auth, games, sessions, scoring, leaderboards, challenges, analytics, admin |
| `packages/engine` | Shared TypeScript game engine: templates, seeded level generators, param schemas, scoring |
| `docs/` | [Architecture](docs/architecture.md) · [Adding a game](docs/adding-a-game.md) |

## Quick start

Requires Node 22+, pnpm 10, PostgreSQL 16 and Redis 7 (`docker compose up -d` starts both).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @axia/engine build
pnpm db:migrate        # creates tables
pnpm db:seed           # Memory Reconstruction + easy/medium/hard + today's challenges + admin@axia.local
pnpm dev               # API on :4000, web on :3000
```

Open http://localhost:3000. With `ALLOW_DEV_LOGIN=true` you can sign in with any email. `admin@axia.local` is an admin; every address in `ADMIN_EMAILS` is promoted to admin when it signs in.

### Google sign-in

1. In Google Cloud Console, create an OAuth client of type **Web application**.
2. Add `http://localhost:3000` (and your production domain) to the authorised JavaScript origins.
3. Put the client ID in both `apps/api/.env` (`GOOGLE_CLIENT_ID`) and `apps/web/.env.local` (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
4. Set `ALLOW_DEV_LOGIN=false` (and the web equivalent) in production. The API refuses dev-login whenever `NODE_ENV=production`.

## Checks

```bash
pnpm typecheck
pnpm test        # engine unit tests (Vitest) + API e2e tests (Jest + supertest)
```

The API e2e tests need a running Postgres and Redis. They use a separate `axia_test` database and Redis DB 15 (override with `TEST_DATABASE_URL` / `TEST_REDIS_URL`).

## Status

This is the **foundation slice**:
- Auth: Google, plus dev-login
- Age gating: self-declared, 14–18 TEEN, 19+ ADULT
- Config-driven game engine
- Memory Reconstruction, playable end to end
- Server-authoritative scoring with basic anti-fraud checks
- Daily and weekly challenges
- Leaderboards with rank and TOP x%
- Challenge-a-friend share links
- Skill profile
- Analytics events
- Admin control center: dashboard, games, difficulty presets with live preview, challenges, users, audit log

**Not built yet, intentionally:**
- Subscriptions and payments (₹249 / ₹399 / ₹49–149)
- Rewards inventory
- Referrals
- Missions
- AI content pipeline
- The other four launch games
- Notifications

Paid access and rewards must be classified by a lawyer under India's gaming framework (Phase 0) before they are built. The pages for these features are "coming soon" stubs.
