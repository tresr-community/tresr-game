# Implementation Loop

Process all tickets in `docs/tickets/todo/` and implement them.

## Setup (Every Iteration)

1. Read `AGENTS.md` for project guidelines.
2. Read `docs/spec.md` for functional specifications.
3. List all tickets in `docs/tickets/todo/` (exclude `UAT.md`).
4. If no tickets remain, skip to **Completion**.
5. Sort by priority: Critical > High > Medium > Low.
6. Within the same priority, do easier/smaller tickets first.
7. Check for dependency chains — if ticket B depends on ticket A, do A first.
8. Pick the next unimplemented ticket.

## Per-Ticket Workflow

For each ticket:

1. **Read** the ticket file completely, including any linked analysis.
2. **Validate** against the current codebase:
   - Verify referenced files, functions, and line numbers still exist.
   - If refactored, renamed, or deleted — update the ticket to reflect reality or mark obsolete.
   - If ambiguous or conflicting, skip with documented reason.
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
8. If you discover new issues during implementation, create tickets in `docs/tickets/todo/`.
9. If UAT tasks are needed, append them to `docs/tickets/todo/UAT.md`.

## Rules

- You are in God Mode. Don't make mistakes.
- Only process ONE ticket per iteration then exit to allow the loop to re-evaluate state.
- Always check off tasks in the ticket file as they are completed.
- The `docs/tickets/` directory is gitignored — it is for local tracking only. **Never** stage or commit files from `docs/tickets/`.
- If `prek run` fails, fix the issues before committing.
- If a ticket is blocked or needs human input, skip it and move to the next one.

## Completion

When all tickets in `docs/tickets/todo/` (excluding `UAT.md`) are either:

- Moved to `docs/tickets/done/` (implemented and committed)
- Marked as obsolete (referenced code no longer exists)
- Skipped with documented reason (ambiguous, blocked, needs UAT)

Then output: `<promise>CODE_COMPLETE</promise>`
