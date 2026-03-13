# TRESR Game Copilot Instructions

TRESR is a decentralized game hosted on the Internet Computer blockchain.

The architecture is Juno's "One Repo, One App" pattern: a single satellite canister hosts both the static Astro frontend and Rust serverless functions.

Avalanche C-Chain smart contracts for the token economy.

## Project Layout

```text
src/                          # Astro frontend
  components/                 # Reusable .astro UI components
  layouts/                    # Page layouts
  lib/                        # TypeScript utilities and game logic
  styles/global.css           # Global styles + DaisyUI theme overrides
src/satellite/                # Juno satellite (Rust serverless functions)
  src/lib.rs                  # Satellite entry points
  src/evm_rpc.rs              # Avalanche EVM RPC integration
contracts/                    # Solidity smart contracts (Foundry)
config/tresr.yaml             # SINGLE SOURCE OF TRUTH for all configuration
docs/spec.md                  # Game specifications and mechanics
bin/                          # Asset processing CLI scripts (TypeScript/bun)
.github/actions/              # Composite actions for CI/CD
.github/workflows/            # GitHub Actions pipelines
```

## Technology Stack

- **Frontend**: Astro + Vanilla TypeScript (no React). DaisyUI + Tailwind CSS v4 for styling.
- **Backend**: Rust (`ic-cdk 0.19`) compiled to `wasm32-unknown-unknown` via Juno satellite
  - Juno SDK pins to ic-cdk 0.19; do not upgrade satellite's ic-cdk without Juno first upgrading
- **Smart Contracts**: Solidity via Foundry on Avalanche C-Chain
- **Dev environment**: All tooling via `devenv` (Nix). Use `bun`/`bunx` not `npm`/`npx`
- **Secrets**: `secretspec` + 1Password. Sandbox fallback: `CI=true SECRETSPEC_PROVIDER=env devenv shell --quiet -- <cmd>`

## Quick Commands

```bash
juno-dev start         # Start emulator + Astro dev server
juno-dev stop          # Stop everything
juno-dev deploy        # Build and deploy to local satellite
juno-dev lint          # Run linters
juno-dev logs          # Tail canister logs
bun run client-config  # Regenerate src/types/config.ts from config/tresr.yaml
forge test             # Solidity tests
```

## Configuration — Critical Rule

**All** tunable values (physics, gameplay, contract addresses, chain IDs, scoring) belong in
`config/tresr.yaml`. Never hardcode magic numbers or addresses in source files.
After editing `config/tresr.yaml`, run `bun run client-config` to regenerate derived TypeScript types.
Never edit generated files manually.

## TypeScript / Astro Guidelines

- **No React**: use vanilla TypeScript + DOM APIs + Astro `<script>` tags. Nano stores for complex shared state.
- **Logging**: always use `import {log} from "@/lib/utils/log"`. Never use `console.log/error/warn/debug` directly in `src/` (linter will flag it).
  - `log.warn` and `log.error` trigger toast notifications — use `log.info` inside toast/notification internals to avoid recursion.
- **TypeScript strict**: no `any` types; fully type all exports and function signatures.
- **Naming**: TypeScript variables use `camelCase`; JSON wire format and Juno collections use `snake_case`.

## Rust / Satellite Guidelines

- **ic-cdk version**: `0.19.0` (pinned by Juno SDK — do not upgrade)
- **Caller identity**: `ic_cdk::api::msg_caller()` or `ic_cdk::caller()` (both valid in 0.19)
- **Stable storage**: use `ic-stable-structures` for data that survives upgrades
- **Input validation**: always validate all inputs in serverless functions; never trust client data
- **Logging format**: `[CollectionName] Updated collection <name> for user <id> with <field>=<value>`

## Juno Collections (Canonical — do not add without updating config/tresr.yaml + docs/spec.md)

| Collection | Access  | Purpose                                   |
| ---------- | ------- | ----------------------------------------- |
| `audit`    | Managed | Private admin audit trail                 |
| `economy`  | Public  | Economy-wide stats (`global` doc)         |
| `scores`   | Public  | Per-user leaderboard + `top_scorer` cache |
| `users`    | Managed | Per-user prefs, stats, wallet             |

Storage bucket `images`: user avatar uploads (owner-write only).

## DaisyUI / Styling Guidelines

- **Always use DaisyUI semantic classes** (`btn`, `card`, `modal`, etc.) over raw Tailwind
- Game aesthetic: cyberpunk/synthwave theme. Use `data-theme` attributes on root elements.
- Custom CSS goes in `src/styles/global.css` only — not inline, not scattered
- Test responsiveness; use DaisyUI responsive modifiers (`btn-sm`, `lg:hidden`)

## Solidity / Foundry Guidelines

- All Foundry tooling via `devenv.nix`. Use `forge`, `cast`, `slither` from devenv shell.
- OpenZeppelin contracts for standards (ERC20, access control, UUPS proxy)
- 100% test coverage with `forge test`; include fuzzing
- Run `slither .` after every contract change
- Never hardcode private keys or RPC URLs — use `secretspec` / env vars
- Testnet deploy first; mainnet requires manual approval via GitHub Actions

## GitHub Actions

- Validate workflow YAML with `actionlint` and `action-validator` before committing
- Step ID convention: `verb_noun` snake_case (e.g. `detect_changes`, `build_functions`)
- See `docs/ci-cd.md` for pipeline architecture

## Asset Processing (bin/ scripts)

Use the unified scripts in `bin/`; never create one-off conversion scripts:

- `bun run sprites -- --convert` — PNG/JPG sprite sheets → WebP
- `bun run audio -- --convert` — MP3/OPUS → WebM
- `bun run videos -- --convert` — MP4 → animated WebP
- `bun run wallpapers -- --sync` / `--update` / `--pending` — wallpaper management

## Code Quality Gates

Before any commit (all run inside `devenv shell`):

1. `bun run lint` (ESLint + Astro check)
2. `cargo clippy -- -D warnings` (satellite)
3. `cargo fmt --check` (satellite)
4. `actionlint` (GitHub Actions)

## Commit Convention

Conventional commits: `type(scope): description`
Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
Scope examples: `game`, `satellite`, `contracts`, `ci`, `ui`
