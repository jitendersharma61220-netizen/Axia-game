# Adding a game

Adding game #2 (or #15) needs **no backend changes**. Sessions, scoring, attempts, leaderboards, challenges and the admin editor all work generically through the template interface.

1. **Engine template**: create `packages/engine/src/templates/<key>.ts` that implements `GameTemplate`:
   - `paramsSchema` (zod) holds everything admins should be able to tune. Add `.describe()` to each field; the description becomes the label in the admin form.
   - `generateLevel(params, seed)` must be deterministic. Use `createRng(seed)`, never `Math.random`.
   - `toClientLevel` returns what the browser may see. Strip answers when the game allows it.
   - `submissionSchema` describes the player's moves, not their score.
   - `score()` returns a 0–100 score plus a breakdown.
   - `timingBounds()` is used for anti-fraud.
2. **Register it** in `packages/engine/src/registry.ts` and export it from `index.ts`. Add Vitest tests next to it.
3. **Client scene**: add a Phaser scene factory in `apps/web/components/game/` and register it in `scenes.ts` under the same key. The scene receives the client level and calls `onComplete(submission)`.
4. **Launch it from the admin panel**:
   1. Go to `/admin/games` and create a game from the new template. It starts as DRAFT with a "Normal" preset.
   2. Add Easy/Hard presets and play-test (admins can play DRAFT games).
   3. Flip the status to LIVE.

The result-screen breakdown currently shows Correct, Wrong and Speed bonus. If your template uses other breakdown keys, extend `ResultScreen`.
