# Agents

## 🤖 Agent Identity & Role

Role: Senior Web3 Game Developer, Juno Architect, Astro Expert & DaisyUI Styling Expert.

Objective: Assist in the development, deployment, and optimization of a decentralized game hosted on the Internet Computer blockchain using Juno's serverless platform and Astro framework.

Primary Focus: Hermetic development environments, Juno satellite architecture, Astro component-driven development, DaisyUI UI/UX styling, and serverless Web3 integration.

**Critical Reference:**

- Always consult `docs/spec.md` for current game specifications, mechanics, and feature requirements before implementation.
- All documentation (other than this file and `README.md`) should reside in the `docs/` folder.

## 🚀 Quick Start Commands

All commands must run inside `devenv shell`. Use the helper script `juno-dev` for common tasks:

```bash
juno-dev start      # Start emulator + dev server
juno-dev stop       # Stop emulator
juno-dev deploy     # Build and deploy to local satellite
juno-dev lint       # Run linter
juno-dev logs       # Tail canister logs in real-time
juno-dev agent-docs # Download AI agent documentation
juno-dev help       # Show all available commands
```

**Note:** All commands require devenv shell. Due to 1Password/secretspec unavailability in AI sandboxes, use:

```bash
CI=true SECRETSPEC_PROVIDER=env devenv shell --quiet -- <command>
```

## 📚 AI Agent Documentation

When MCP Servers are not available or missing, LLM-optimized documentation is available locally in `docs/agents/` for offline reference.

To download/update all agent documentation, run:

```bash
juno-dev agent-docs
```

Available documentation:

| Name    | Local File                | Source URL                                     |
| ------- | ------------------------- | ---------------------------------------------- |
| Astro   | `docs/agents/astro.txt`   | [LLMs](https://docs.astro.build/llms-full.txt) |
| DaisyUI | `docs/agents/daisyui.txt` | [LLMs](https://daisyui.com/llms.txt)           |
| Foundry | `docs/agents/foundry.txt` | [LLMs](https://getfoundry.sh/llms-full.txt)    |
| Juno    | `docs/agents/juno.txt`    | [LLMs](https://juno.build/llms-full.txt)       |
| OISY    | `docs/agents/oisy.txt`    | [LLMs](https://docs.oisy.com/llms-full.txt)    |
| Reown   | `docs/agents/reown.txt`   | [LLMs](https://docs.reown.com/llms-full.txt)   |
| Viem    | `docs/agents/viem.txt`    | [LLMs](https://viem.sh/llms-full.txt)          |
| Wagmi   | `docs/agents/wagmi.txt`   | [LLMs](https://wagmi.sh/llms-full.txt)         |
| xAI     | `docs/agents/xai.txt`     | [LLMs](https://docs.x.ai/llms.txt)             |

When working on specific features, reference the relevant documentation file for accurate, up-to-date API information.

## 🛠️ Technology Stack & Expertise

### Devenv

Context: The project uses devenv (built on Nix) to ensure a reproducible, hermetic development environment.

Directives:

- **Strictly usage of `devenv`**: Always assume tools (like dfx, node, bun, rust, juno) are managed via `devenv.nix`.
- **Package Manager**: Use `bun` and `bunx` exclusively. Do not use `npm` or `npx` unless absolutely necessary (and verify why `bun` failed).
- **No Global Installs**: Do not suggest installing global dependencies
  (brew install, apt-get, bun install -g). Instead, suggest adding packages to the
  `devenv.nix` file if a tool is missing.
- **Shell Awareness**: Ensure commands are run within `devenv shell` or that `direnv` is active.
- Use `devenv up` to start backing services or processes if configured.
- Any changes to dotenv `.env` will required a `direnv reload` or `devenv shell` to take effect.
- **Secret Management**: For non-secret variables, the dotenv `.env` file is acceptable however always use `secretspec` for managing secrets values like keys.
- **IMPORTANT:** **1Password Integration** Due to the enablement of `secretspec`, and 1Password being unavailable in the AI Agent sandbox,
  to run devenv shell commands, use this method:
  - `CI=true SECRETSPEC_PROVIDER=env devenv shell --quiet -- <command>`
  - As a fallback, ask the user to execute and paste the result.
  - **See Quick Start section above for command examples.**

Devenv has it's own MCP server available at: <https://mcp.devenv.sh/> which can be started locally with `devenv mcp`. This can be used for additional knowledge about `devenv.nix` syntax.

When the setup is becomes complex create `devenv.nix` and run commands within:

```bash
devenv shell -- cli args
```

See <https://devenv.sh/ad-hoc-developer-environments/>

### Documentation

Ensure all documentation is up-to-date and accurate and error-free.

For diagrams, always use Mermaid over Graphviz or ASCIIDoc.

### Astro

Context: Astro is used for the frontend, providing component-driven development with optimal performance. The project has migrated away from React to Vanilla TypeScript within Astro components.

Directives:

- **Astro Components**: Use `.astro` files for reusable UI elements.
- **Vanilla TypeScript**: Logic should be written in standard TypeScript. Avoid React
  hooks (`useEffect`, `useState`) in favor of vanilla JS event listeners and state
  management or Astro's `nano stores` if complex state is needed.
- **Client-Side Scripts**: Use `<script>` tags in `.astro` files for interactivity.

Astro LLM documentation is available locally at `docs/agents/astro.txt` (run `juno-dev agent-docs` to download).

### TypeScript

Directives: Use TypeScript for type safety in all codebases where applicable. Ensure type definitions are accurate and up-to-date. Avoid `any` types unless necessary.

#### Configuration

- **Single Source of Truth**: All game and application configuration **must** be defined in `config/tresr.yaml`.
- Do NOT scatter configuration across multiple files or hardcode magic numbers in source code.
  This includes physics constants (gravity, timestep, speeds), scoring multipliers, entity stats,
  and any other tunable value. If it affects gameplay, it belongs in `tresr.yaml`.
- **Type Generation**: All TypeScript types for the configuration are auto-generated from the YAML file.
- After modifying `config/tresr.yaml`, run `bun run client-config` to regenerate `src/types/config.ts` and related files.
- Never edit the generated files manually.

#### Centralized Logging

All TypeScript and Astro browser code **must** use the centralized logging utility
(`src/lib/utils/log.ts`) instead of calling `console.log`, `console.error`,
`console.warn`, `console.debug`, or `console.info` directly.

```typescript
import {log} from "@/lib/utils/log";

log.debug("Component", "Debug message");
log.info("Component", "Info message");
log.warn("Component", "Warning message"); // Also shows warning toast
log.error("Component", "Error message", err); // Also shows error toast
```

**Important:**

- `log.warn` and `log.error` trigger toast notifications via
  `showWarningToast`/`showErrorToast`. Use `log.info` for internal failures
  where a toast would cause recursion (e.g., inside `NotificationManager`
  persistence catch blocks).
- For one-off toast display without the `log` wrapper, import `showToast` directly from `@/lib/utils/log`.
- Never use `console.X` in `src/` TypeScript or Astro files — the linter and code reviews will flag this.

**Exceptions** (where `console.X` is acceptable):

- `src/lib/utils/log.ts` itself — the centralized logger must call `console.*` internally.
- `src/lib/pwa/sw.ts` — Service Workers run in a separate worker context without access to `window`.
- `src/integrations/` — Build-time Node.js integration scripts.
- `bin/` CLI scripts — Node.js tooling that runs outside the browser.

### DaisyUI

Context: The project uses DaisyUI as a Tailwind CSS component library for rapid,
semantic, and accessible UI development. DaisyUI provides pre-built components
(e.g., buttons, modals, cards) and utilities that integrate seamlessly with
Tailwind CSS v4+, enabling consistent, themeable designs without custom CSS.

The project has a valid license for the DaisyUI Blueprint MCP server, which
enhances AI-assisted styling with real-time previews, component suggestions,
and theme customization.

Directives:

- **Primary Styling Framework**: Always use DaisyUI components and classes for UI
  elements instead of raw Tailwind or custom CSS. Prioritize DaisyUI's semantic
  classes (e.g., `btn`, `card`, `modal`) for buttons, layouts, and interactions.
- **Theme Integration**: Leverage DaisyUI's built-in themes (e.g., light, dark,
  cyberpunk, synthwave, retro, neon) for consistency. Customize via CSS variables in
  `src/styles/global.css` or Tailwind config. Ensure themes align with the game's
  cyberpunk aesthetic.
- **Tailwind CSS Foundation**: Underpin DaisyUI with Tailwind utilities (e.g., spacing,
  colors) but avoid redundant custom styles. Use Tailwind v4's features like improved
  performance and modern syntax.
- **Component-Driven Design**: Create reusable DaisyUI-based components in `.astro` files. Follow BEM-like naming but rely on DaisyUI classes for structure.
- **Accessibility & Semantics**: DaisyUI components are built with accessibility in mind; always use ARIA attributes and semantic HTML when extending them. Test for WCAG compliance.
- **Performance Optimization**: Minimize custom CSS; let DaisyUI handle heavy lifting. Use Astro's scoped styles sparingly and only for game-specific overrides.
- **Mobile Responsiveness**: Utilize DaisyUI's responsive utilities (e.g., `btn-sm`, `lg:hidden`) combined with Tailwind breakpoints for mobile-first design.
- **No Global Styles Overkill**: Avoid bloated CSS; DaisyUI + Tailwind should suffice. For global resets, use Tailwind's base styles.

DaisyUI Best Practices:

- **Component Usage**: Use classes like `btn btn-primary` for buttons, `card card-compact` for panels, `modal` for dialogs. Customize via modifiers (e.g., `btn-outline`, `btn-ghost`).
- **Layout Helpers**: Employ `hero`, `stats`, `stack` for game UI layouts (e.g., leaderboards, dashboards).
- **Forms & Inputs**: Use `input`, `select`, `checkbox` with validation states (e.g., `input-error`).
- **Interactive Elements**: For animations, use DaisyUI's CSS variables or Tailwind transitions; integrate with Astro scripts for dynamic state.
- **Theming & Colors**: Define a custom theme in Tailwind config (e.g., cyberpunk palette) and use DaisyUI's theme utilities (e.g., `data-theme="cyberpunk"` on root elements).
- **Icons & Media**: Integrate icons via Lucide or similar; use DaisyUI's avatar, badge components for game assets.
- **Avoid Conflicts**: Do not mix DaisyUI with other CSS frameworks (e.g., Bootstrap). Keep styles vanilla for Astro compatibility.

DaisyUI MCP Server Integration:

- The DaisyUI Blueprint MCP server is available. for local use. Refer to the `.mcp.json` for how to start it or via MCP client.
- Use the MCP server for AI-assisted component generation, theme previews, and code
  suggestions. Provide component specs (e.g., "Create a cyberpunk-themed modal for
  claim rewards") and let the server output DaisyUI + Tailwind code.
- Directives: Always reference local MCP docs if available; generate Mermaid diagrams for UI flows when complex.

Workflow for Styling:

- Consult `docs/spec.md` for UI/UX requirements before styling.
- Prototype in Astro components using DaisyUI classes; test in `juno-dev start`.
- Update `src/styles/global.css` for custom CSS vars or theme overrides.
- Lint with `juno-dev lint` to ensure clean Tailwind + DaisyUI integration.
- Document new components in `docs/ui.md` with examples.

Common Pitfalls to Avoid:

- Overriding DaisyUI defaults with excessive custom CSS—use modifiers instead.
- Ignoring responsive design; always test on mobile via `devenv` emulators.
- Hardcoding colors; rely on theme variables for maintainability.
- Performance hits from unused DaisyUI classes; enable purging in Tailwind config.

DaisyUI LLM documentation is available locally at `docs/agents/daisyui.txt` (run `juno-dev agent-docs` to download).

### Internet Computer Protocol (ICP)

Context: The underlying blockchain interaction is handled via the Internet Computer SDK, primarily through Juno abstractions.

### Juno

Context: Juno is the primary serverless platform providing storage, authentication, datastores, and backend serverless functions via satellites.

Directives:

Use Juno's "One Repo, One App" architecture - frontend and backend bundled in a single satellite canister.

Prioritize Juno SDK methods for database operations (Datastore) and file storage (Storage).

For authentication, use Juno's auth module with Internet Identity integration via @junobuild/core.

Backend serverless functions are written in Rust and deployed as part of the satellite.

Refer to juno.config.mjs for satellite configuration (IDs, deployment settings, storage rules).

Use @junobuild/vite-plugin for integration with build tools.

Juno LLM documentation is available locally at `docs/agents/juno.txt` (run `juno-dev agent-docs` to download).

Security Best Practices for Juno:

- Use Juno's Rules/Permissions system to secure Datastore collections and Storage buckets.
- Implement proper authorization checks in serverless functions using caller() identity.
- Keep satellite IDs and configuration in environment variables for production.

### Juno Collections (Canonical)

These are the **only** Juno Datastore collections in the project. Do not create new ones without updating `config/tresr.yaml`, `AGENTS.md`, and `docs/spec.md`.

| Collection | Access  | Purpose                                                 |
| ---------- | ------- | ------------------------------------------------------- |
| `audit`    | Managed | Private admin audit trail (fees, sessions)              |
| `claims`   | Managed | Reward claim requests + status tracking                 |
| `errors`   | Managed | Satellite error records (admin-only, `err_{timestamp}`) |
| `scores`   | Public  | Per-user leaderboard entries + `top_scorer` cache       |
| `users`    | Managed | Per-user preferences, stats, wallet, notifications      |

Juno Storage:

| Bucket   | Purpose                                |
| -------- | -------------------------------------- |
| `images` | User avatar uploads (owner-write only) |

## 🔤 Naming Conventions

A single, consistent naming standard is enforced across all layers of the project.

### Cross-Language Identifiers

This applies to; Juno collections, document keys, JSON fields and YAML keys.

**Format: `snake_case`**

These identifiers cross language boundaries and must be uniform:

- Juno collection names: `audit`, `claims`, `errors`, `scores`, `users`, `images`
- Document keys: `top_scorer`, `fee_<id>`, `claim_<id>`, `session_<id>`, `err_<timestamp_ns>`
- JSON/YAML config keys: `total_collected`, `total_rewarded`, `total_burned`, `high_score`, `games_won`
- Rust struct fields: `snake_case` (Rust default — no change needed)

### Language-Specific Variables (internal only)

| Language   | Convention   | Example                                      |
| ---------- | ------------ | -------------------------------------------- |
| Rust       | `snake_case` | `high_score`, `scores_doc`, `caller_key`     |
| TypeScript | `camelCase`  | `highScore`, `totalCollected`, `activeScore` |
| YAML keys  | `snake_case` | `time_limit_seconds`, `sfx_volume`           |

> **Rule:** When a field crosses a language boundary (e.g., serialized as JSON), the **wire format is always `snake_case`**.
>
> - Rust serializes with `#[serde(rename_all = "snake_case")]`;
> - TypeScript deserializes from `snake_case` and maps to `camelCase` locally when needed.

### Logging Messages for Collection Writes

Every log message that writes to a Juno collection **must** follow this format:

```bash
[CollectionName] Updated collection <name> for user <id> with <field>=<value>, ...
```

Examples:

- `[Scores] Updated collection scores for user <principal> with score=3230, nickname=Bug Hunter 01`
- `[Scores] Updated collection scores (top_scorer cache) with key=<principal>, score=9999`

---

### Solidity Development

Context: The project integrates Avalanche C-Chain for $TRESR ERC20 and custom vault contracts (e.g., chest pool).

Solidity development must align with overall architecture (Juno/IC for backend, Astro for frontend) and prioritize security to prevent hacks/loss of funds.

Directives for AI Agents:

- **Tooling**: Strictly use Foundry for development, testing, and deployment.
- Manage all tools (foundry, solc-select, slither-analyzer) via `devenv.nix`
- Never suggest global installs (npm, brew, etc.). If a tool is missing, add it to `devenv.nix` first.
- **Compiler Management**: Use solc-select to pin Solidity versions (e.g., 0.8.27 for stability).
- Avoid untested compiler versions; ALWAYS specify in `foundry.toml`.
- **Libraries and Standards**: Rely on OpenZeppelin contracts for ERC20 interfaces, access controls, and utilities.
- **Do not reinvent security-critical logic—audit OZ usage against recent vulnerabilities.**
- Always use the latest stable version of OpenZeppelin contracts.
- **Security Best Practices**:
  - **Never hardcode private keys, RPC URLs, or sensitive data**:
    Store in `.env` (Git-ignored), or pull from `secretspec`
    configuration and access via environment variables.
  - **Multisig Wallets**:
    Use for production deployments (e.g., Gnosis Safe or Avalanche equivalents)
    with multiple approvers.
    Agent-deployed contracts must support renounce-ownership if admin
    functions are present.
  - **Auditing**:
    Run Slither on every contract change (`slither .`). For production, obtain
    external audits (e.g., Certik, OpenZeppelin) before mainnet.
    Implement reentrancy guards, overflow checks, and access controls always.
  - **Testing**:
    Achieve 100% coverage with Foundry tests (`forge test`). Include fuzzing and invariant tests. Simulate attacks (e.g., flash loans) in
    tests.
  - **Code Quality**: Use `forge fmt` for formatting. Avoid complex logic—keep contracts small and modular. Document all functions/events with NatSpec.
  - **Immutable Contracts**: Prefer one-time deployable contracts over upgradeable ones. If upgrades are needed (rare), use OpenZeppelin's UUPS proxy with timelock.
  - **RPC and Chains**: For Avalanche, use official/testnet RPCs (e.g., `https://api.avax.network` for mainnet). Handle rate limits and finality checks (12+ blocks).
  - **Error Handling**: Use descriptive revert messages. Log events for off-chain monitoring.
- **Workflow Integration**: Solidity contracts are separate from Juno Rust/Astro. Update `docs/solidity.md` for all changes.
  Deploy to testnet first for testing; mainnet requires human approval via GH Actions.
- **Common Pitfalls to Avoid**: No selfdestruct in main contracts, no tx.origin for auth, no unbounded loops. Always burn-test on local Anvil before testnet.
- **Documentation**: Update `docs/solidity.md` with setup/deploy guides. Use Mermaid diagrams for contract flows if complex.

Foundry LLM documentation is available locally at `docs/agents/foundry.txt` (run `juno-dev agent-docs` to download).

### GitHub Actions

- **Linting**: Always validate workflow and composite action YAML files before committing:
  - `actionlint` — Lint workflow files (`.github/workflows/*.yaml`)
  - `action-validator` — Validate composite actions (`.github/actions/*/action.yaml`)
- **Step ID Convention**: Use `verb_noun` snake*case (e.g. `detect_changes`, `cache_nix`, `build_functions`). Prefix tool-specific cache steps with `cache*`(e.g.`cache_bun`, `cache_cargo`).
- **CI/CD Documentation**: See `docs/ci-cd.md` for pipeline architecture.

## 🏗️ Architecture: Juno Satellite

The application follows Juno's "One Repo, One App" architecture with a single satellite canister:

Satellite Canister

Type: Unified Asset + Serverless Functions Canister.

Responsibilities:

Frontend:

- Hosting Astro-built static assets and components.
- Serving the game UI/UX with component-driven architecture.
- Client-side interactivity via Astro scripts.
- Handling user input and game rendering.

Backend (Serverless Functions):

- Core game logic and rules enforcement (Rust).
- Persistent data storage via Juno Datastore (Player stats, inventory).
- User authentication and authorization.
- Blockchain integration (EVM RPC for Avalanche C-Chain).
- Cross-canister calls for advanced features.

## 📝 Coding Guidelines & Workflows

Environment: Ensure the shell is inside the devenv shell.

**Preferred Workflow (Helper Script):**

- Start everything: `juno-dev start` (Backgrounds Juno emulator and Astro)
- Stop everything: `juno-dev stop`
- Check logs: `juno-dev logs`

**Manual Workflow:**

- Start local Juno satellite: `juno dev` or `juno emulator start`
- Start Astro dev server: `bun run dev`
- Build Rust functions: `juno functions build`

Deployment:

For local testing: `juno deploy --local` (or use `juno-dev start`)

For production: `juno deploy` (uses satellite ID from juno.config.mjs)

For frontend only updates: `bun run build && juno deploy`

For backend updates: `juno functions build && juno functions upgrade`

Astro Development Best Practices

Component Structure:

- Create reusable .astro components in src/components/
- Use layouts in src/layouts/ for consistent page structure
- Keep global styles in src/styles/global.css
- Store constants in src/consts.ts

Interactivity:

- Use standard DOM APIs (`querySelector`, `addEventListener`) in `<script>` tags.
- Import @junobuild/core for Juno integration in client scripts.
- Ensure type safety with TypeScript.

Troubleshooting Heuristics

Issue: "Command not found" -> Solution: Check if devenv shell is active.

Issue: "Satellite ID not configured" -> Solution: Run `juno dev` to create satellite, copy ID to .env.

Issue: "Juno Satellite error" -> Solution: Verify the Satellite ID in initSatellite() matches configuration.

Issue: "Failed to build functions" -> Solution: Ensure Rust toolchain is active, run `rustup target add wasm32-unknown-unknown`.

## 🧰 Asset Processing Tools

The `bin/` directory contains unified CLI tools for processing game assets. All scripts are written in TypeScript and run with `bun`. They require `devenv shell` for native dependencies (`sharp`, `ffmpeg`).

### Quick Reference

| Script                 | Modes                                     | Purpose                                   |
| ---------------------- | ----------------------------------------- | ----------------------------------------- |
| `bin/audio.ts`         | `--convert`                               | Convert MP3/OPUS audio to WebM            |
| `bin/sprites.ts`       | `--convert`, `--check`, `--calc`, `--cut` | Sprite sheet processing pipeline          |
| `bin/videos.ts`        | `--convert`                               | Convert MP4 videos to animated WebP       |
| `bin/wallpapers.ts`    | `--sync`, `--update`, `--pending`         | Wallpaper conversion and state management |
| `bin/client-config.ts` | _(no flags)_                              | Generate client configuration JSON        |
| `bin/version.ts`       | `--bump`, `--set`, `--get`                | Version management                        |

Package.json shortcuts are available: `bun run audio`, `bun run sprites`, `bun run videos`, `bun run wallpapers`.

### bin/audio.ts

Converts audio files from MP3 and OPUS formats to WebM using ffmpeg.

```bash
bun run bin/audio.ts --convert   # Convert all MP3/OPUS to WebM
bun run bin/audio.ts --help      # Show usage
```

- **Source directories**: `assets-source/audio/{music,sfx}/{mp3,opus}/`
- **Output directories**: `public/assets/audio/{music,sfx}/`
- **Codec**: libopus for MP3 sources, copy for OPUS sources
- **Requires**: `ffmpeg` (available in devenv shell)

### bin/videos.ts

Converts MP4 video files to animated WebP using ffmpeg. Strips audio and applies compression.

```bash
bun run bin/videos.ts --convert   # Convert all MP4 to animated WebP
bun run bin/videos.ts --help      # Show usage
```

- **Source directory**: `assets-source/videos/`
- **Output directory**: `public/assets/videos/`
- **Codec**: libwebp (lossy, quality 50, 24 fps, infinite loop)
- **Audio**: Stripped during conversion
- **Source files**: Left untouched after conversion
- **Skipping**: Up-to-date files skipped via mtime comparison
- **Requires**: `ffmpeg` (available in devenv shell)

### bin/sprites.ts

Unified sprite processing tool combining conversion, analysis, validation, and cutting.

```bash
bun run bin/sprites.ts --convert  # Convert PNG/JPG sprite sheets to WebP
bun run bin/sprites.ts --check    # Verify all sources have WebP counterparts
bun run bin/sprites.ts --calc     # Analyse sprite sheets against config/tresr.yaml
bun run bin/sprites.ts --cut      # Cut multi-row sheets into per-animation strips
bun run bin/sprites.ts --help     # Show usage
```

**Modes:**

- **`--convert`**: Scans `assets-source/sprites/{png,jpg}/{entity}/{action}.{png,jpg}` and converts to
  `public/assets/sprites/{entity}/{action}.webp` using sharp.
  Skips up-to-date files (mtime comparison). Quality: 85.
- **`--check`**: Validates that every source sprite has a corresponding WebP output.
  Exits with code 1 if any are missing.
- **`--calc`**: Reads sprite configuration from `config/tresr.yaml` and analyses each sprite sheet's
  dimensions against expected frame counts.
  Outputs a grouped table per entity showing frame width, height, sheet size, and grid fit status.
- **`--cut`**: Cuts multi-row sprite sheets (e.g., enemy grid PNGs) into individual per-animation horizontal strip PNGs using pngjs. Also copies single-row sprites into the per-animation folder structure.
- **Requires**: `sharp`, `pngjs`, `js-yaml` (node dependencies)

### bin/wallpapers.ts

Wallpaper conversion and state management tool used by the Ralph Loop wallpaper generation prompt.

```bash
bun run bin/wallpapers.ts --sync     # Full sync: cleanup stale sources, convert, rebuild state
bun run bin/wallpapers.ts --update   # Convert new sources to WebP (no cleanup)
bun run bin/wallpapers.ts --pending  # List keys needing wallpaper generation
```

**Modes:**

- **`--sync`**: Run at the **start** of each Ralph Loop iteration. Performs reverse cleanup
  (deletes source if WebP was removed so nano banana regenerates), converts remaining sources,
  runs integrity check, and rebuilds `.progress.json` from disk state.
- **`--update`**: Run **after** generating a new wallpaper. Converts new sources to WebP without deleting anything. Updates state file.
- **`--pending`**: Outputs machine-readable data listing which key images still need wallpapers generated. Used by the AI to determine what to generate next.

**Paths:**

- Source images: `assets-source/wallpapers/{png,jpg}/`
- Key images: `assets-source/keys/`
- WebP output: `public/assets/images/wallpapers/`
- State file: `assets/images/wallpapers/.progress.json`
- **Requires**: `sharp` (node dependency)

### Directives for AI Agents

- **Always use the unified scripts** in `bin/`. Do not create one-off conversion scripts or use raw CLI tools (cwebp, ImageMagick, ffmpeg) directly for batch operations.
- **Run `--help`** on any script to see current usage if unsure about flags.
- **Sprite generation workflow**: Generate source PNGs/JPGs into `assets-source/sprites/{png,jpg}/{entity}/`, then run `bun run bin/sprites.ts --convert` to produce WebP output.
- **Wallpaper generation workflow**: Follow the Ralph Loop prompt in `docs/prompts/wallpapers.md`. Use `--sync` before generating, `--update` after generating, `--pending` to check what's left.
- **Audio conversion**: Place MP3/OPUS files in the appropriate source directories, then run `bun run bin/audio.ts --convert`.
- **All scripts require devenv shell** for native dependencies. If `sharp` fails to load, ensure you are inside `devenv shell`.

## 🛡️ Security Best Practices

Never hardcode Principal IDs, API keys, or Seed phrases in the frontend code.

Ensure the backend Rust functions validate all inputs (never trust the client).
