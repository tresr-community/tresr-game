# CI/CD Pipeline

## Overview

The tresr-game project uses GitHub Actions for CI/CD with a release-driven deployment model.
Workflows are chained using `workflow_call` for reliable, explicit orchestration.

## Release Flow

```mermaid
flowchart TD
    A["Push to trunk"] --> B["cd-release.yaml"]
    C["Manual dispatch<br/>(Testnet)"] --> B
    D["Manual dispatch<br/>(Mainnet)"] --> B

    B --> E{"Environment?"}

    E -->|"Testnet<br/>(auto or manual)"| F["pre-release job"]
    E -->|"Mainnet<br/>(manual only)"| G["promote job"]

    F --> F1["Compute version<br/>(convco)"]
    F1 --> F2["Bump version files"]
    F2 --> F3["Generate changelog"]
    F3 --> F4["Create GitHub<br/>Pre-Release"]
    F4 --> H["deploy-juno-testnet<br/>(workflow_call)"]

    G --> G1["Validate release tag"]
    G1 --> G2["Promote to<br/>full release"]
    G2 --> I["deploy-juno-mainnet<br/>(workflow_call)"]

    H --> H1["Build Juno Functions"]
    H1 --> H2["Deploy Hosting<br/>(staging)"]
    H2 --> H3["Apply Config<br/>(staging)"]
    H3 --> H4["Publish Functions<br/>(staging)"]

    I --> I1["Build Juno Functions"]
    I1 --> I2["Deploy Hosting<br/>(production)"]
    I2 --> I3["Apply Config<br/>(production)"]
    I3 --> I4["Publish Functions<br/>(production)"]
```

## CI Pipelines

```mermaid
flowchart LR
    subgraph "CI (Pull Requests)"
        CI1["ci-devenv.yaml<br/>Devenv health check"]
        CI2["ci-foundry.yaml<br/>Solidity tests"]
        CI3["ci-juno.yaml<br/>Juno build + lint"]
    end

    subgraph "CD (Releases)"
        CD1["cd-release.yaml<br/>Version + tag"]
        CD2["cd-foundry-testnet.yaml<br/>Deploy contracts"]
        CD3["cd-juno-testnet.yaml<br/>Deploy Juno (testnet)"]
        CD4["cd-juno-mainnet.yaml<br/>Deploy Juno (mainnet)"]
    end

    CD1 -->|workflow_call| CD3
    CD1 -->|workflow_call| CD4
```

## Workflows

| Workflow                  | Trigger                      | Description                                |
| ------------------------- | ---------------------------- | ------------------------------------------ |
| `ci-devenv.yaml`          | PR, push                     | Validates devenv builds correctly          |
| `ci-foundry.yaml`         | PR, push                     | Runs Solidity tests via Foundry            |
| `ci-juno.yaml`            | PR, push                     | Builds Juno satellite + functions          |
| `cd-release.yaml`         | Push to trunk, manual        | Creates pre-release or promotes to release |
| `cd-foundry-testnet.yaml` | Push to trunk (contracts/)   | Deploys Solidity contracts to Fuji         |
| `cd-juno-testnet.yaml`    | Called by cd-release, manual | Deploys Juno to testnet                    |
| `cd-juno-mainnet.yaml`    | Called by cd-release, manual | Deploys Juno to mainnet                    |

## Environments

| Environment | Purpose                                    | Secrets                                                   |
| ----------- | ------------------------------------------ | --------------------------------------------------------- |
| **Testnet** | Staging deployments                        | `JUNO_TOKEN`, `DEPLOYER_PRIVATE_KEY`, `SNOWTRACE_API_KEY` |
| **Mainnet** | Production deployments (requires approval) | `JUNO_TOKEN`, `DEPLOYER_PRIVATE_KEY`, `SNOWTRACE_API_KEY` |

## Design Decisions

### workflow_call over event chaining

Deploy workflows are called directly via `workflow_call` rather than triggered by `release` events
(`prereleased`/`released`). This avoids [GitHub's `GITHUB_TOKEN` limitation](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow)
where events created by `GITHUB_TOKEN` do not trigger other workflows.

Deploy workflows also support `workflow_dispatch` for manual re-runs independent of the release flow.
