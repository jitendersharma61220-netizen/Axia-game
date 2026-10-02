# Architecture

```
Browser ──► Next.js (apps/web) ──/api/* rewrite──► NestJS (apps/api) ──► PostgreSQL (source of truth)
   │             │                                     │                └► Redis (config cache, attempts, leaderboards)
   │             └ Phaser scene per template           └ @axia/engine (generate level, score)
   └ same @axia/engine types
```

## Core principle: games are config + content

A **template** (code, in `packages/engine`) defines how a kind of game works:
- a zod schema of tunable **params**
- a deterministic `generateLevel(params, seed)`
- `score()`
- timing bounds for anti-fraud

A **game** (a database row) is a template plus metadata: status, age modes, attempts per day, availability window, sort order. A game has one or more **difficulty presets**, each of which is a set of params. A **challenge** is a game, a preset, a fixed seed and a time window, so every player gets the identical level.

Admins edit games, presets and challenges in `/admin`:
- Writes are validated against the template schema.
- Every write is recorded in `AuditLog`.
- Every write invalidates the Redis config cache.

The next session therefore uses the new settings, with no deploy or restart.

## Game session lifecycle

1. `POST /api/games/:slug/sessions`
   - Checks onboarding and age mode.
   - Reserves a daily attempt atomically in Redis.
   - Picks a preset or challenge and a seed.
   - Snapshots the params.
   - Returns `toClientLevel(level)`.
2. The browser plays the level in the Phaser scene and posts only the player's moves.
3. `POST /api/sessions/:id/submit`
   - Validates the submission schema.
   - Regenerates the level from the stored seed and params snapshot, and **re-scores on the server**. A score claimed by the client is ignored.
   - Checks the duration against the template's timing bounds: too fast → `FLAGGED` and kept off leaderboards; too slow → `EXPIRED`.
   - Allows one submit per session, enforced by a conditional update.
   - Updates the leaderboards.
4. Leaderboards are Redis sorted sets holding each player's best score:
   - one per game: `lb:{gameId}:all`
   - one per day: `lb:{gameId}:daily:YYYY-MM-DD`, in IST
   - one per week: `lb:{gameId}:weekly:YYYY-Www`
   - one per challenge: `lb:challenge:{id}`

   "TOP x%" means rank divided by the number of players. `pnpm --filter @axia/api leaderboard:rebuild` rebuilds the boards from Postgres.

### What the browser gets to see

| Game | Answers sent to the browser? | Why |
| --- | --- | --- |
| Digital Detective | No: the culprit stays on the server | There is no instant feedback, so nothing needs to leak |
| Internet Café Mission | No: the bill total, password option index and target file id stay on the server | Same reason |
| Memory Reconstruction | Yes, by nature | The player must see the objects |
| Rule Shift, Neural Boss | Yes | Instant ✓/✗ feedback needs the answer on the client |

In every case the server re-scores from the seed and the player's moves, and enforces timing bounds. A future hardening step for instant-feedback games: validate each answer through the API, without sending answers to the client.

Neural Boss uses the same `fightStep()` from the engine on the client (for animation) and on the server (for replay), so both sides always agree on the fight.

## Auth

- Google Identity Services issues an ID token, which the API verifies with `google-auth-library`.
- The API then sets a 30-day httpOnly JWT cookie.
- The web app proxies `/api`, so the cookie is first-party.
- A global `AuthGuard` resolves the user on every request and enforces the `@Public()` and `@Roles(ADMIN)` decorators.

## Analytics

- `AnalyticsEvent` rows are written on the server for: `signup`, `login`, `onboarding_complete`, `game_start`, `game_complete`.
- The browser can record a short allowlist of events: `share_click`, `share_open`, `challenge_accept`, `page_view`.

These events are enough to compute D1/D7/D30 retention, completion rates and the viral loop. The admin dashboard shows today's counts.

## What's next (per the roadmap)

- Scale to 20 games: each is a new template + Phaser scene (see [adding-a-game.md](adding-a-game.md))
- Subscriptions/payments, rewards, referrals (after legal review)
- AI content pipeline: generator → validation (template `paramsSchema` / content schema) → admin approval → pool
