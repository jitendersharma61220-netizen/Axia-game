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

| Game | Answers sent to the browser? | How it stays honest |
| --- | --- | --- |
| Digital Detective | No: the culprit stays on the server | No instant feedback is needed; the server scores at the end |
| Internet Café Mission | No: the bill total, password option index and target file id stay on the server | Same |
| Rule Shift | No: the hidden rule stays on the server (easy mode shows it on purpose) | Each sort is judged by `POST /sessions/:id/steps` |
| Neural Boss | No: correct options stay on the server | Each answer is judged by `POST /sessions/:id/steps`; the server replays the fight and returns the new HP |
| Memory Reconstruction | Yes, by nature | The player must see the objects; scoring and timing checks happen on the server |
| Neon Dodge | Only the current wave's seed | Each wave's recorded inputs are replayed on the server, which then reveals the next wave's seed |

**Instant-feedback games** implement `interactive` on their template (`packages/engine/src/types.ts`). Every move flow works like this:

1. The browser posts the move to `POST /api/sessions/:id/steps` as `{ index, step }`.
2. The server regenerates the level from the seed and judges the move with `interactive.check`.
3. It records the move in Redis. `HSETNX` makes each move write-once.
4. It returns the verdict, e.g. `{ correct }`, or `{ hit, answer, state }` for Neural Boss.

The rules:
- Moves must arrive in order, exactly once. Replays and skips get 409.
- Nothing is accepted after the game ends.
- At submit, the browser's payload is **ignored**. The score comes only from the recorded moves (`interactive.toSubmission`).
- Moves arriving less than 150 ms apart are flagged `too_fast_steps` and kept off the leaderboard.

Admins still see the answers: the admin "Preview level" endpoint returns the full server level.

### Real-time games: replay verification (Neon Dodge)

Neon Dodge is a deterministic simulation (`packages/engine/src/templates/neon-dodge.ts`). The browser and the server run the same code, and it is bit-exact everywhere: integer maths, an integer sine table, and no `Math.sin`/`cos`/`atan2`.

1. The browser gets only the first wave's seed. Wave seeds are one-way hashes of the secret session seed.
2. While playing, the browser records the finger target for every tick (60 per second) as a run-length list.
3. At the end of a wave (or on a hit) it posts that list as one step. The server replays every wave so far from the inputs and decides the outcome. Only if the wave was survived does it return the next wave's seed.
4. The score is the replayed score. A claimed score, a forged "survived", or inputs that don't produce the run are all simply ignored.

**Pacing.** Templates with `interactive.stepPlayMs` replace the 150 ms rule with a pacing check. Each wave must arrive about as long after the previous one as the play it covers: no faster than 0.85× (minus 0.5 s), and no slower than 1.35× (plus 5 s), with extra time for the first wave. Anything else is flagged `off_pace`. This blocks simulating a run offline and rewinding or pausing to think. Leaving the tab ends the run.

**Known limit.** A real-time bot that sees the screen can still play well. Behaviour-based bot detection is future work.

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
