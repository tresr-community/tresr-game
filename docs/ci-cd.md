# CI/CD Architecture

## Release Flow

```mermaid
graph TD
    A["Push to trunk"] --> B["cd-release.yaml"]
    C["Manual dispatch"] --> B

    B --> D{"Environment?"}
    D -->|"Testnet (auto/manual)"| E["pre-release job"]
    D -->|"Mainnet (manual)"| F["promote job"]

    E --> G["Create GitHub Pre-Release"]
    G --> H["cd-juno-testnet.yaml<br/>(workflow_call)"]

    F --> I["Promote Pre-Release → Release"]
    I --> J["cd-juno-mainnet.yaml<br/>(workflow_call)"]

    H --> K["Deploy Hosting + Functions + Config"]
    J --> L["Deploy Hosting + Functions + Config"]
```

## CI Pipeline

```mermaid
graph LR
    PR["Pull Request"] --> CI["ci-devenv.yaml"]
    PR --> FCI["ci-foundry.yaml"]
    PR --> JCI["ci-juno.yaml"]

    CI --> T1["devenv test"]
    FCI --> T2["forge lint + check"]
    JCI --> T3["juno build + check"]
```

## `workflow_call` Design

Deploy workflows (`cd-juno-testnet.yaml`, `cd-juno-mainnet.yaml`) accept both `workflow_call` and `workflow_dispatch` triggers:

- **`workflow_call`** — called by `cd-release.yaml` after creating/promoting a release. Version is passed as input. Uses `secrets: inherit`.
- **`workflow_dispatch`** — manual fallback for re-deploying a specific version.

This replaces the previous event-based chaining (`release: types: [prereleased/released]`), which required a Personal Access Token because `GITHUB_TOKEN` events don't trigger further workflows.

## Foundry Deploy

`cd-foundry.yaml` is a single parameterized workflow that handles both testnet and mainnet:

- **Push to trunk** (contracts/ changes) → always deploys to Testnet (Fuji)
- **Manual dispatch** → choose Testnet or Mainnet

Config values (RPC URL, addresses) are read dynamically from `config/tresr.yaml` based on the resolved network.

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
| File extension    | `.yaml`                                    | —                          |
