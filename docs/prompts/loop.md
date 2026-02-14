# Loop: Implement Tickets + Code Review

Combined loop that implements backlog tickets then reviews the codebase.

## Determine Phase

Each iteration, determine which phase to execute:

1. List tickets in `docs/tickets/todo/` (exclude `UAT.md`).
2. If implementable tickets remain, execute **Phase 1**.
3. If no tickets remain, check if `docs/tickets/done/.review-complete` exists.
   - If it does NOT exist, execute **Phase 2**.
   - If it exists, skip to **Completion**.

---

## Phase 1: Implement One Ticket

Process a single ticket per iteration, then exit to let the loop re-evaluate.

### Setup

1. Read `AGENTS.md` for project guidelines.
2. Read `docs/spec.md` for functional specifications.
3. Sort tickets by priority: Critical > High > Medium > Low.
4. Within the same priority, do easier/smaller tickets first.
5. Check for dependency chains — if ticket B depends on ticket A, do A first.
6. Pick the next unimplemented ticket.

### Ticket Workflow

1. **Read** the ticket file completely, including any linked analysis.
2. **Validate** against the current codebase:
   - Verify referenced files, functions, and line numbers still exist.
   - If refactored, renamed, or deleted — update the ticket or mark obsolete and skip.
   - If ambiguous or conflicting — skip with documented reason.
3. **Implement** the changes, ensuring they meet the spec.
4. **Check off** each acceptance criteria item in the ticket as completed.
5. **Stage and lint**:

   ```bash
   SECRETSPEC_PROVIDER=env devenv shell --quiet -- git add --all ':!docs/tickets/'
   SECRETSPEC_PROVIDER=env devenv shell --quiet -- prek run
   ```

6. **Commit** with conventional commit style (never include `docs/tickets/`):

   ```bash
   git commit -m "feat(<component>): Implement changes from ticket #<number>"
   ```

7. **Move** the completed ticket to `docs/tickets/done/`.
8. If you discover new issues, create tickets in `docs/tickets/todo/`.
9. If UAT tasks are needed, append them to `docs/tickets/todo/UAT.md`.

After processing one ticket, exit the iteration. The loop will re-enter and pick the next ticket.

---

## Phase 2: Code Review

Runs once after all tickets are implemented. Perform a read-only review then create tickets for findings.

### Review Process

1. Read `docs/spec.md` for context.
2. Read `docs/roadmap.md` for upcoming plans.
3. Review all tickets in `docs/tickets/done/` for completeness.
4. Review any remaining tickets in `docs/tickets/todo/` for accuracy.
5. Systematically review the codebase for:
   - Bugs and logic errors
   - Security vulnerabilities
   - Performance issues
   - Memory leaks
   - Missing error handling
   - Hardcoded values that should use config
   - Non-deterministic code in gameplay paths
   - Missing cleanup (timers, listeners, subscriptions)
   - Comments like "TODO|FIXME|HACK|XXX" and ensure there are backlog tickets for them.
6. For each finding, check if an existing ticket already covers it.
7. Create new tickets in `docs/tickets/todo/` for uncovered findings.
   - Each ticket must have enough detail for an AI agent to implement without mistakes.
   - Follow the established ticket format (Priority, Status, Description, Problem, Acceptance Criteria, Files to Modify, Related Tickets).
   - Use the next sequential ticket number after the highest existing number.
8. Create marker file: `touch docs/tickets/done/.review-complete`

After the review, exit the iteration. If new tickets were created, subsequent iterations will implement them (Phase 1). Once no tickets remain and the review marker exists, the loop completes.

---

## Rules

- Only process ONE ticket per iteration then exit.
- Always re-read state from disk at the start of each iteration.
- The `docs/tickets/` directory is gitignored — local tracking only. **Never** stage or commit files from `docs/tickets/`.
- If `prek run` fails, fix the issues before committing.
- If a ticket is blocked or needs human input, skip it and move on.

## Completion

When all of the following are true:

- No implementable tickets remain in `docs/tickets/todo/`
- Code review is complete (`docs/tickets/done/.review-complete` exists)
- No new tickets were created during review (or they have all been implemented)

Then output: `<promise>LOOP_COMPLETE</promise>`
