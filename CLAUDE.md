# Claude Code Instructions

## Required Reading

Before starting any task, read the following files for project context:

- `AGENTS.md` - Detailed agent instructions, technology stack, coding guidelines, and workflows
- `docs/spec.md` - Current game specifications, mechanics, and feature requirements

## Quick Reference

- **Package Manager**: Use `bun` exclusively (not npm/npx)
- **Environment**: All commands run in `devenv shell`
- **Helper Script**: Use `juno-dev` for common tasks (build, deploy, start, stop, etc.)
- **AI Docs**: Run `juno-dev agent-docs` to download LLM documentation to `docs/agents/`

## Key Commands

```bash
juno-dev start      # Start emulator + dev server
juno-dev stop       # Stop emulator
juno-dev deploy     # Build and deploy to local satellite
juno-dev agent-docs # Download AI agent documentation
juno-dev lint       # Run linter
```

## Running Commands in Devenv

**ALL commands MUST be run inside `devenv shell`.** Tools like `cargo`, `bun`, `gh`, `git` (with pre-commit hooks), `juno`, and `solidity-check` are only available inside the devenv environment.

Due to 1Password/secretspec being unavailable in the AI agent sandbox, use this pattern:

```bash
# Single command
SECRETSPEC_PROVIDER=env devenv shell --quiet -- <command>

# Examples
SECRETSPEC_PROVIDER=env devenv shell --quiet -- cargo check
SECRETSPEC_PROVIDER=env devenv shell --quiet -- juno-dev build-functions
SECRETSPEC_PROVIDER=env devenv shell --quiet -- git commit -m "feat: add feature"
SECRETSPEC_PROVIDER=env devenv shell --quiet -- gh pr create --base trunk --title "fix: something"
SECRETSPEC_PROVIDER=env devenv shell --quiet -- devenv test
```

> **WARNING:** Running commands outside devenv will cause failures (missing binaries, broken pre-commit hooks, etc.)
