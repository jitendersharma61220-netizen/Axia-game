# Axia — Skill-Game Platform

[![CI](https://github.com/jitendersharma61220-netizen/Axia-game/actions/workflows/ci.yml/badge.svg)](https://github.com/jitendersharma61220-netizen/Axia-game/actions/workflows/ci.yml)

Short skill games with daily challenges, leaderboards, and "challenge a friend" sharing. Games are **driven by config, not hard-coded**: difficulty, timings, content pools, attempts, availability, and challenges are all changed from the admin panel and take effect on the next game, with no redeploy.

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 15 + Tailwind: the player site and the `/admin` control center, with Phaser game scenes |
| `apps/api` | NestJS 11 + Prisma (PostgreSQL) + Redis: auth, games, sessions, scoring, leaderboards, challenges, analytics, admin |
| `packages/engine` | Shared TypeScript game engine: templates, seeded level generators, param schemas, scoring |
| `deploy/` | Production Docker Compose stack (Caddy HTTPS, Postgres, Redis) and a backup script |
| `docs/` | [Architecture](docs/architecture.md) · [Adding a game](docs/adding-a-game.md) · [Deploying](docs/deploy.md) |

## Quick start

Requires Node 22+, pnpm 10, PostgreSQL 16 and Redis 7 (`docker compose up -d` starts both).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @axia/engine build
pnpm db:migrate        # creates tables
pnpm db:seed           # all 6 games × 3 difficulties + today's challenges + admin@axia.local
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

**CI:** GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on every push to `main`. It has four parallel checks:
- typecheck + engine tests
- API e2e tests against Postgres 16 and Redis 7 service containers
- the web build
- both production Docker images

The API e2e tests need a running Postgres and Redis. They use a separate `axia_test` database and Redis DB 15 (override with `TEST_DATABASE_URL` / `TEST_REDIS_URL`).

## Status

**Six games are playable end to end.** The arcade game is the main event, and the other five are warm-ups:

| Game | Type | What it tests |
| --- | --- | --- |
| **Neon Dodge** (arcade) | Endless bullet-hell dodger, 1–5 min runs | Reflexes and nerve. Waves get faster and meaner, with lasers, bursts, homing mines and a boss every 5 waves. Grazes build a combo. Every run is replayed on the server from its inputs |
| Internet Café Mission | Long-form mission, 15–30 min | A nostalgic 2003 café. Stages: CAPTCHA, dial-up sequence, café bill, file hunt, password recall |
| Digital Detective | Deduction, 10–20 min | Clues and suspects. Exactly one suspect matches every clue |
| Memory Reconstruction | Memory, 5–10 min | Objects flash on a grid; the player rebuilds it |
| Rule Shift | Cognitive flexibility, 5–10 min | Sort cards by a hidden rule that keeps changing |
| Neural Boss | Speed / mental math, 5–15 min | A boss fight powered by rapid-fire puzzles |

Every game has three difficulty presets in the seed (Neon Dodge: Normal, Hard, Insane), and every setting can be edited in `/admin`.

**Closed-beta tooling:**
- Invite codes, with uses and an active toggle, managed in `/admin/invites`. A friend's challenge link also works as an invite.
- First-touch attribution: invite code, UTM tags, challenge link.
- `/admin/analytics`: daily active players and sign-ups, D1/D7/D30 retention cohorts, the funnel, per-game retention ("which game makes people stay"), and acquisition plus the viral loop.
- A feedback button for players, read in `/admin/feedback`.
- Sign-in, event and feedback rate limits.
- The API refuses to boot with an unsafe production config.
- A one-VPS deploy guide: [docs/deploy.md](docs/deploy.md).

**Also in place:**
- Auth: Google, plus dev-login
- Age gating: self-declared, 14–18 TEEN, 19+ ADULT
- Config-driven game engine
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
- Notifications

Paid access and rewards must be classified by a lawyer under India's gaming framework (Phase 0) before they are built. The pages for these features are "coming soon" stubs.
