# Claude Code Instructions

All AI agent instructions, technology stack guidance, and project conventions are documented in a single source of truth:

**→ See [`AGENTS.md`](./AGENTS.md)**

This file contains:

- Agent identity and role
- AI agent documentation references
- Technology stack and expertise (devenv, Astro, TypeScript, DaisyUI, Juno, etc.)
- Naming conventions
- Architecture overview
- Coding guidelines and workflows
- Asset processing tools
- Security best practices

**Quick Start:**

```bash
juno-dev start      # Start emulator + dev server
juno-dev stop       # Stop emulator
juno-dev deploy     # Build and deploy
juno-dev help       # Show all commands
```

For devenv shell access in AI sandboxes:

```bash
CI=true SECRETSPEC_PROVIDER=env devenv shell --quiet -- <command>
```

See `AGENTS.md` for complete details.
