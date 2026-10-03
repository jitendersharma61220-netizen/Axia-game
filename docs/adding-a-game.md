# Adding a game

Adding game #2 (or #15) needs **no backend changes**. Sessions, scoring, attempts, leaderboards, challenges and the admin editor all work generically through the template interface.

1. **Engine template**: create `packages/engine/src/templates/<key>.ts` that implements `GameTemplate`:
   - `paramsSchema` (zod) holds everything admins should be able to tune. Add `.describe()` to each field; the description becomes the label in the admin form.
   - `generateLevel(params, seed)` must be deterministic. Use `createRng(seed)`, never `Math.random`.
   - `toClientLevel` returns what the browser may see. Strip answers when the game allows it.
   - `submissionSchema` describes the player's moves, not their score.
   - `howToPlay` lists the short instructions shown on the game page.
   - `score()` returns:
     - a 0–100 score (use `normalizeScore`)
     - a `breakdown` of numbers that is stored
     - three `highlights` for the result screen
     - optional `notes`, e.g. "it was Meera"
   - `timingBounds()` is used for anti-fraud.
   - If the game shows instant ✓/✗ feedback, implement `interactive` (`stepSchema`, `check`, `toSubmission`). The browser then never needs the answers: the scene calls `server.step(index, move)` and renders the verdict. See `rule-shift` and `neural-boss`.
2. **Register it** in `packages/engine/src/registry.ts` and export it from `index.ts`. Add Vitest tests next to it.
3. **Client scene**:
   - Add a Phaser scene factory in `apps/web/components/game/` and register it in `scenes.ts` under the same key.
   - The scene receives the client level and calls `onComplete(submission)`.
   - Use the helpers in `ui.ts`: `label`, `button`, `TimerBar`, `clearScene`.
   - Optionally, add a renderer in `components/admin/LevelPreview.tsx` so the admin "Preview level" button shows a readable summary. Without one, it shows JSON.
4. **Launch it from the admin panel**:
   1. Go to `/admin/games` and create a game from the new template. It starts as DRAFT with a "Normal" preset.
   2. Add Easy/Hard presets and play-test (admins can play DRAFT games).
   3. Flip the status to LIVE.

**Real-time games** (action, reflex) follow the Neon Dodge pattern:
- Write the game as a deterministic engine simulation that both the scene and the server run. Use integer maths only (`+ - *`, `Math.trunc`, `Math.sqrt`, `Math.imul`, lookup tables). Transcendental functions differ between browsers.
- Make each wave or segment one interactive step that carries the recorded inputs. Reveal the next segment's seed only in the verdict.
- Implement `interactive.stepPlayMs` so the server can check the pacing.
- Set `category: 'arcade'` and return `maxScore: 0` for an uncapped score.

The existing templates are good references:
- `rule-shift`: instant feedback judged move by move on the server
- `digital-detective`: answers hidden from the client
- `neural-boss`: server-side fight replay with per-answer verdicts
- `internet-cafe-mission`: multi-stage, with a different UI per stage
- `neon-dodge`: real-time arcade, replay-verified wave by wave, with an autopilot for tests and the admin difficulty preview
