# Code Review

**READ-ONLY MODE** — Do not modify source code. Only create ticket files.

**IMPORTANT**: Do NOT stop or pause between steps. Process ALL steps
sequentially in a single run. Use the progress file to skip already completed.
steps if you are re-invoked after running out of context.

## Setup

1. Read `AGENTS.md` for coding guidelines and technology stack.
2. Read `docs/spec.md` for game specifications and mechanics.
3. Read `docs/roadmap.md` for upcoming plans.
4. Note the highest ticket number in `docs/tickets/done/` and
   `docs/tickets/todo/` — new tickets start after that.
5. Read `docs/tickets/done/.review-progress` if it exists — this tracks
   which steps are complete. Skip any step already listed.

Then proceed through Step 1, Step 2 (all areas), and Completion **without
stopping**.

---

## Step 1: Review Existing Tickets

Skip if `docs/tickets/done/.review-progress` contains `tickets-reviewed`.

1. Read all tickets in `docs/tickets/done/` — check for incomplete
   implementations, regressions, or gaps between what the ticket promised
   and what was delivered.
2. Read all tickets in `docs/tickets/todo/` — check for stale references
   (files/lines that no longer exist), conflicting requirements, or
   missing detail.
3. Update any todo tickets that reference outdated file paths or line
   numbers.
4. Mark step complete:

   ```bash
   echo "tickets-reviewed" >> docs/tickets/done/.review-progress
   ```

5. **Continue immediately to Step 2.**

---

## Step 2: Review Codebase

Process each area in order. Skip any area already listed in the progress
file. Only report findings with confidence >= 80%.

### Review Areas (in order)

1. `scenes` — Game scenes: `src/lib/game/scenes/`
2. `prefabs` — Entity prefabs: `src/lib/game/prefabs/`
3. `auth` — Auth and wallet: `src/lib/auth/`, `src/lib/wallet/`
4. `systems` — Game systems: `src/lib/game/` (state, fee-gate, Recorder,
   MusicManager, SpriteManager)
5. `config` — Config pipeline: `bin/client-config.ts`, `src/lib/config/`,
   `src/lib/utils/`
6. `components` — UI components: `src/components/`
7. `pages` — Pages: `src/pages/`
8. `pwa` — PWA: `src/lib/pwa/`
9. `backend` — Backend: `src/satellite/`

### Categories to Check

- **Bugs**: Logic errors, race conditions, null/undefined access,
  off-by-one errors, incorrect state transitions.
- **Security**: XSS (innerHTML with user data), injection vectors, timing
  attacks, session manipulation, missing input validation, exposed secrets,
  fee/payment bypasses.
- **Determinism**: Any `Math.random()` in gameplay paths (must use seeded
  RNG). Non-deterministic code breaks replay validation.
- **Memory Leaks**: Untracked timers (`delayedCall`, `setInterval`,
  `setTimeout`), orphaned event listeners, store subscriptions without
  cleanup, Audio elements not released.
- **Performance**: Per-frame operations that could use change detection,
  unnecessary redraws, store updates without dirty checking, expensive
  operations in hot loops.
- **Configuration**: Hardcoded values that should come from
  `config/tresr.yaml`, config hash gaps (gameplay values not included in
  anti-cheat hash).
- **Cleanup**: Missing `shutdown()`/`destroy()` implementations, listeners
  not removed on navigation (`astro:before-preparation`), Phaser scene
  resources not freed.
- **Error Handling**: Missing try/catch on async operations, silent
  failures, broken error recovery paths.
- **Comments**: Look for "TODO|FIXME|HACK|XXX" etc comments from
  developers and ensure there are backlog tickets for them.
- **Phaser Best Practices**: Identify custom implementations that duplicate
  or conflict with built-in Phaser features. Examples include:
  - Manual body positioning that `updateFromGameObject()` already handles.
  - Custom scaling logic when Phaser's `_sx`/`_sy` body scaling suffices.
  - Reimplemented collision detection instead of Arcade overlap/collide.
  - Manual sprite pooling instead of Phaser Groups with `maxSize`.
  - Hand-rolled animation state machines instead of Phaser animation events.
  - Custom input handling that bypasses Phaser's Input plugin.
  - Manual camera effects instead of Phaser's Camera API.
    For each finding, note the custom code location, the Phaser API that
    could replace it, and the relevant Phaser documentation reference.

### Per-Area Workflow

For **each** area (do not stop between areas):

1. Read all files in the area.
2. Create tickets for findings (see Step 3).
3. Mark area complete:

   ```bash
   echo "<area-name>" >> docs/tickets/done/.review-progress
   ```

4. **Continue immediately to the next area.**

---

## Step 3: Create Tickets

For each finding not already covered by an existing ticket:

1. Create a new ticket file in `docs/tickets/todo/` using format `NNN.md`
   (next sequential number).
2. Follow this template:

   ```markdown
   # Ticket NNN: <Short descriptive title>

   ## Priority: <Critical | High | Medium | Low>

   ## Status: Todo

   ## Description

   <What the issue is and why it matters.>

   ## Problem

   <Exact file paths, line numbers, and code snippets showing the issue.>

   ## Acceptance Criteria

   - [ ] <Specific, testable requirement>
   - [ ] <Another requirement>
   - [ ] Run `juno-dev lint` with no new errors.

   ## Files to Modify

   - `<exact/file/path.ts>` (<brief note on what changes>)

   ## Related Tickets

   - Ticket NNN: <title> (if applicable)
   ```

3. Each ticket must contain enough detail for an AI agent to implement
   without guessing:
   - Exact file paths verified against the current codebase.
   - Line numbers or function names for the problematic code.
   - Code snippets showing the current (broken) state.
   - Clear fix description or acceptance criteria.
4. Priority guidelines:
   - **Critical**: Breaks core gameplay, enables exploits, data loss, XSS.
   - **High**: Memory leaks, payment bypasses, significant bugs.
   - **Medium**: Performance issues, missing cleanup, config gaps.
   - **Low**: Code quality, minor UX bugs, hardcoded values.

---

## Rules

- **Do not modify source code.** Only create/update ticket files.
- **Never** stage or commit files from `docs/tickets/` — it is gitignored
  and for local tracking only.
- **Do NOT stop between steps or areas.** Process everything sequentially
  in a single run.
- Re-read progress file at the start to skip completed work.
- Only report findings with confidence >= 80%.

## Completion

When all of the following are true:

- `docs/tickets/done/.review-progress` contains `tickets-reviewed` and
  all 9 area names.
- New tickets have been created for all uncovered findings.

Then output: `<promise>REVIEW_COMPLETE</promise>`
