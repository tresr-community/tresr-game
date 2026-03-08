# CI/CD Architecture

## Release Flow (Two-Pass)

Contract addresses have a circular dependency between Juno (oracle) and
Foundry (token, vault). The pipeline uses a **two-pass** approach:

### Testnet (automatic on trunk push)

```mermaid
graph TD
    subgraph "1st pass — contract deploy"
        A["Push to trunk"] --> B["pre-release"]
        B --> C["deploy-juno </br> testnet"]
        C -->|oracle_address| D["deploy-foundry </br> testnet"]
        D -->|contract addresses| E["update-config </br> job"]
        E --> F["Create PR with </br> new addresses"]
    end

    subgraph "2nd pass — config update"
        F -->|merge PR| G["Push to trunk"]
        G --> H["pre-release </br> (skipped - tag exists)"]
        H --> I["deploy-juno-testnet </br> (redeploys with new config)"]
        I --> J["deploy-foundry-testnet </br> (skipped - no changes)"]
    end
```

### Mainnet (manual promotion)

```mermaid
graph TD
    promote["promote </br> (manual dispatch)"] --> L["promote job"]

    subgraph "1st pass — contract deploy"
        L --> M["cd-juno </br> mainnet"]
        M -->|oracle_address| N["cd-foundry </br> mainnet"]
        N -->|contract addresses| O["update-config </br> mainnet job"]
        O --> P["Create PR with </br> mainnet addresses"]
    end

    subgraph "2nd pass — config update"
        P -->|merge PR| Q["Manual dispatch </br> (2nd run)"]
        Q --> R["promote job </br> (re-run)"]
        R --> S["cd-juno-mainnet </br> (redeploys with new config)"]
        S --> T["cd-foundry-mainnet </br> (skipped - no changes)"]
    end
```

## Developer Workflow

```mermaid
graph TD
    A["Create branch"] --> B["Open PR"]
    B --> C["CI runs </br> (lint, test, build, security)"]
    C --> D["PR approved"]
    D --> E["Merge queue"]
    E --> F["Merged to trunk"]
    F --> G["Pre-release created </br> (automatic)"]
    G --> H["Testnet deployed"]
    H --> I["UAT / QA"]
    I --> J["Run cd.yaml </br> (Mainnet 1st run)"]
    J --> K["Contracts deployed </br> + config PR created"]
    K -->|merge PR| L["Run cd.yaml </br> (Mainnet 2nd run)"]
    L --> M["Config applied </br> + deployed"]
```

## Manually Runnable Workflows

Only these workflows can be triggered manually via `workflow_dispatch`:

| Workflow                   | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `cd.yaml`                  | Create pre-release and deploy to Testnet or promote and deploy to Mainnet |
| `chore-devenv-update.yaml` | Update devenv.lock, create PR                                             |

All other workflows are triggered automatically by events
(PR, push, merge_group, schedule, workflow_call).

## Mainnet Promotion

When running `cd.yaml` for Mainnet:

- **With `release_tag`**: Promotes that specific pre-release
- **Without `release_tag`**: Auto-discovers the latest pre-release and promotes it
- **If latest release is already promoted**: Errors with a helpful message

The GitHub `Mainnet` environment requires manual approval before the promote job runs.

## CI Pipeline

```mermaid
graph LR
    PR["Pull Request"] --> SE["setup-environment<br/>(build dev shell cache)"]
    SE --> CI["ci.yaml (Gatekeeper)"]

    CI --> |workflow_call| CI_DEVENV["ci-devenv.yaml"]
    CI --> |workflow_call| CI_FOUNDRY["ci-foundry.yaml"]
    CI --> |workflow_call| CI_JUNO["ci-juno.yaml"]
    CI --> |workflow_call| CI_PR_TITLE["ci-pr-title.yaml"]
    CI --> |workflow_call| CI_TRIVY["ci-trivy.yaml"]
    CI --> |workflow_call| CI_CODEQL["sec-codeql.yaml"]
```

### The "Gatekeeper" Strategy

We use a strictly-parallel orchestration pipeline pattern.

1. `ci.yaml` and `cd.yaml` act as absolute entry points (Gatekeepers).
2. The gatekeeper triggers `setup-devenv` synchronously, populating the GitHub L2 cache.
3. Once populated, the Gatekeeper fires off all subsequent workflows
   (`ci-devenv.yaml`, `ci-foundry.yaml`, `ci-juno.yaml`, `cd-juno.yaml` etc.)
   in strictly segregated runners using `workflow_call`.

**30-Day Caching (`devenv.lock` Hash)**
The `setup-devenv` action uses `hashFiles('devenv.lock', 'devenv.nix')` for the primary cache key.
This explicitly maps the cache to that exact deterministic hash, achieving a **0-second upload penalty**
at the end of every workflow because it recognizes the artifact perfectly, and the cache is kept alive
for 30 days.

### ci.yaml (Gatekeeper)

Validates the developer environment builds and tests correctly, checks Solidity contracts,
and builds the Juno satellite. All jobs depend on the `setup-environment` job finishing first
to leverage a single unified Devenv cache.

1. `ci-devenv.yaml` -- `devenv test`
2. `ci-foundry.yaml` -- `solidity-dev check`
3. `ci-juno.yaml` -- `lint`, `test`, `build hosting`, `build functions`

> [!NOTE]
> The Solidity contract check job runs on every PR even without changes to report the required "Check Contracts" status. A `detect_changes` step skips the actual check when no contracts changed.

## Foundry Deploy

Foundry deploys are split into two `workflow_call`-only workflows called by the unified `cd.yaml`:

| Workflow                  | Environment | Contracts deployed            |
| ------------------------- | ----------- | ----------------------------- |
| `cd-foundry-testnet.yaml` | Testnet     | Test Token, Faucet, Vault     |
| `cd-foundry-mainnet.yaml` | Mainnet     | Vault only (real TRESR token) |

Both are `workflow_call` only — they receive `oracle_address` from the corresponding Juno deploy when called by the unified release workflow.

Shared logic is extracted into four composite actions under
`.github/actions/`:

| Action                   | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `detect-foundry-changes` | Check contract source changes since last git tag |
| `foundry-deploy-setup`   | Secret checks, caching, config, balance, build   |
| `foundry-resolve-vault`  | Detect deploy/upgrade mode, run Forge scripts    |
| `foundry-deploy-summary` | Generate GitHub Actions job summary              |

### Change Detection

A `detect-changes` job gates the deploy:

| Trigger         | Behaviour                                              |
| --------------- | ------------------------------------------------------ |
| `workflow_call` | Compares `contracts/**` changes since previous git tag |

> [!NOTE]
> Config-only changes (e.g. `config/tresr.yaml`) do **not** trigger
> a contract redeployment. The `detect-changes` job skips the deploy.

### Wallet Balance Check

Before any deployment, the pipeline checks the deployer wallet has at
least **0.1 AVAX** (`MIN_DEPLOYER_BALANCE` env var, set in wei).
If the balance is too low, the workflow fails early with a clear error.

### Token + Faucet (Testnet Only)

The `DeployToken.s.sol` script deploys `RonToken` (test ERC-20)
and `TresrFaucet`. This exists only in `cd-foundry-testnet.yaml` —
the mainnet workflow deploys the Vault only (using the real TRESR token).

### Vault (Deploy vs Upgrade)

The pipeline auto-detects whether to do a **fresh deploy** or an
**upgrade** based on the `vault_contract` address in
`config/tresr.yaml`:

| `vault_contract` value     | Pipeline action                                  |
| -------------------------- | ------------------------------------------------ |
| Zero address (`0x0000...`) | Fresh deploy via `Vault.s.sol` (impl + proxy)    |
| Non-zero address           | Upgrade via `UpgradeVault.s.sol` (new impl only) |

#### Fresh Deploy (first time)

1. `Vault.s.sol` deploys the `TresrVault` implementation and
   an `ERC1967Proxy`
2. The proxy address appears in the GitHub Actions job summary
3. **You must update `vault_contract` in `config/tresr.yaml`
   with the proxy address**
4. Push the config change (this does NOT re-trigger contract deployment)

#### Upgrade (subsequent changes)

1. `UpgradeVault.s.sol` deploys a new implementation contract
2. The GitHub Actions job summary shows a **Safe Transaction** section
   with the proxy address, new implementation address, and the
   `upgradeToAndCall` calldata
3. A Safe signer pastes the calldata into the Gnosis Safe
   Transaction Builder

> [!IMPORTANT]
> The CI deployer EOA **cannot** execute the upgrade.
> The `_authorizeUpgrade` function on `TresrVault` requires
> `DEFAULT_ADMIN_ROLE`, which belongs to the Gnosis Safe multisig.
> The pipeline only deploys the new code -- a multisig signer must
> approve the actual upgrade.

### Multisig Upgrade Steps

1. Open the GitHub Actions run for the CD workflow
2. Scroll to the **job summary** -- the Safe transaction details
   are displayed there
3. In the Gnosis Safe UI -- **Transaction Builder** -- **Custom data**:
   - **To**: the proxy address (shown in summary)
   - **Value**: `0`
   - **Data**: paste the calldata from the summary
4. Submit and collect required signatures
5. Once executed, the proxy points to the new implementation

> [!TIP]
> After a successful deploy, the `update-config` job in the release workflow
> automatically creates a PR to update `config/tresr.yaml` with the new
> contract addresses. Review and merge that PR to complete the cycle.

## Juno Deploy

### cd-juno-testnet.yaml

Called by `cd.yaml` (Testnet mode) after a successful pre-release.
Deploys hosting, config, and (if changed) serverless functions
to `staging` mode.

Steps:

1. Parse release tag and set version
2. Detect function changes (diff against previous tag)
3. Build functions (only if changed)
4. `juno hosting deploy --mode staging`
5. `juno config apply --force --mode staging`
6. `juno functions publish --mode staging` (only if changed)

### cd-juno-mainnet.yaml

Called by `cd.yaml` (Mainnet mode) after a successful promotion.
Same structure as testnet but deploys in `production` mode.

## Security Scanning

### sec-codeql.yaml

CodeQL static analysis for security vulnerabilities.
Scans JavaScript/TypeScript, Rust, and GitHub Actions workflows.
Runs on `workflow_call` context from the Gatekeepers (acting dynamically on PRs or Trunk).
Results uploaded to the GitHub Security tab.

### ci-trivy.yaml

Trivy filesystem scan for vulnerabilities, misconfigurations,
exposed secrets, and license compliance.
Runs on `workflow_call` context from the `ci.yaml` Gatekeeper.
Results uploaded as SARIF to GitHub Security.

## Housekeeping

### chore-devenv-update.yaml

Runs weekly (Sunday 00:00 UTC) or on manual dispatch.
Updates devenv dependencies (`devenv update`), runs tests,
and creates a PR with the updated `devenv.lock`.

### ci-pr-title.yaml

Enforces conventional commit format on PR titles
(`type(scope): description`). Required for clean changelogs
and correct semantic version bumps via `convco`.

### comments.yaml

Reacts to issue comments with Giphy responses and optionally
forwards to Discord (gated by the `ENABLE_DISCORD` variable).

## Environment Configuration

Contract addresses are read from `config/tresr.yaml` at deploy time:

```yaml
client:
  blockchain:
    avalanche:
      testnet:
        vault_contract: "0x..." # Proxy address (set after first deploy)
        faucet_contract: "0x..." # Set after first testnet deploy
        tresr_token_contract: "0x..."
        oracle_address: "0x..."
        safe_address: "0x..." # Gnosis Safe multisig
      mainnet:
        vault_contract: "0x..."
        tresr_token_contract: "0x..."
        # ...
```

## Secrets

| Secret                            | Purpose                                       |
| --------------------------------- | --------------------------------------------- |
| `DEPLOYER_PRIVATE_KEY`            | EOA wallet for broadcasting deploy txns       |
| `SNOWTRACE_API_KEY`               | Contract verification on Snowtrace            |
| `JUNO_TOKEN`                      | Juno CLI auth for hosting/functions/config    |
| `PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID                |
| `GIPHY_TOKEN`                     | Giphy API key for comment reactions           |
| `WEBHOOK_DISCORD`                 | Discord webhook URL for comment notifications |
| `DAISYUI_LICENSE`                 | DaisyUI commercial license                    |
| `DAISYUI_EMAIL`                   | DaisyUI account email                         |

## Custom Actions

| Action                   | Purpose                                          |
| ------------------------ | ------------------------------------------------ |
| `cache-bun`              | Cache Bun package manager dependencies           |
| `cache-cargo`            | Cache Cargo/Rust build artifacts                 |
| `cache-foundry`          | Cache Foundry build artifacts                    |
| `detect-foundry-changes` | Check contract source changes since last git tag |
| `foundry-deploy-setup`   | Secret checks, caching, config, balance, build   |
| `foundry-deploy-summary` | Generate GitHub Actions job summary              |
| `foundry-resolve-vault`  | Detect deploy/upgrade mode, run Forge scripts    |
| `free-disk-space`        | Free disk space on GitHub-hosted runners         |
| `report-status`          | Report workflow status to commit checks          |
| `setup-devenv`           | Install and configure devenv with Cachix         |
| `setup-juno`             | Install Juno CLI                                 |
| `update-tresr-config`    | Update tresr.yaml, regenerate config, create PR  |
| `version`                | Manage version bumping across project files      |

## Workflow Inventory

| Workflow                   | Prefix | Trigger                     | Purpose                                  |
| -------------------------- | ------ | --------------------------- | ---------------------------------------- |
| `cd.yaml`                  | cd     | push to trunk, dispatch     | Create pre-release or promote to release |
| `cd-juno-testnet.yaml`     | cd     | workflow_call only          | Deploy Juno to Testnet                   |
| `cd-juno-mainnet.yaml`     | cd     | workflow_call only          | Deploy Juno to Mainnet                   |
| `cd-foundry-testnet.yaml`  | cd     | workflow_call only          | Deploy Solidity contracts to Testnet     |
| `cd-foundry-mainnet.yaml`  | cd     | workflow_call only          | Deploy Solidity contracts to Mainnet     |
| `ci.yaml`                  | ci     | pull_request, merge_group   | Unified Gatekeeper for CI                |
| `ci-devenv.yaml`           | ci     | workflow_call only          | Test devenv shell                        |
| `ci-foundry.yaml`          | ci     | workflow_call only          | Lint and check Solidity                  |
| `ci-juno.yaml`             | ci     | workflow_call only          | Lint, type-check, and build Juno         |
| `chore-devenv-update.yaml` | chore  | schedule (weekly), dispatch | Update devenv.lock, create PR            |
| `ci-pr-title.yaml`         | ci     | workflow_call only          | Validate conventional commit PR titles   |
| `sec-codeql.yaml`          | sec    | workflow_call only          | CodeQL security analysis                 |
| `ci-trivy.yaml`            | ci     | workflow_call only          | Trivy vulnerability scanning             |
| `comments.yaml`            | --     | issue_comment               | Handle slash commands in comments        |

## Naming Conventions

| Element           | Convention                                 | Example                    |
| ----------------- | ------------------------------------------ | -------------------------- |
| Workflow filename | `{ci\|cd\|chore}-{component}[-{env}].yaml` | `chore-devenv-update.yaml` |
| Workflow `name:`  | Title Case                                 | `Juno Deploy (Testnet)`    |
| Job ID            | `kebab-case`                               | `deploy-juno-testnet`      |
| Job `name:`       | Title Case                                 | `Deploy Juno (Testnet)`    |
| Step ID           | `snake_case`                               | `setup_devenv`             |
| Step `name:`      | Title Case Verb-Noun                       | `Setup Devenv`             |
| Action inputs     | `kebab-case`                               | `github-token`             |
| File extension    | `.yaml`                                    | --                         |
