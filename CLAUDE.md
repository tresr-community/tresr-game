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
