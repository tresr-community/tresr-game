# Tresr

[![CI](https://github.com/tresr-community/tresr-game/actions/workflows/ci.yaml/badge.svg)](https://github.com/tresr-community/tresr-game/actions/workflows/ci.yaml)
[![CodeQL](https://github.com/tresr-community/tresr-game/actions/workflows/sec-codeql.yaml/badge.svg)](https://github.com/tresr-community/tresr-game/actions/workflows/sec-codeql.yaml)
[![Trivy](https://github.com/tresr-community/tresr-game/actions/workflows/ci-trivy.yaml/badge.svg)](https://github.com/tresr-community/tresr-game/actions/workflows/ci-trivy.yaml)

A 2.5D de-centralised platformer game built on the Internet Computer, featuring blockchain integration with Avalanche C-Chain.

This is an unofficial game made for the TRESR community and is not affiliated with the official TRESR project.

It is made with ❤️ love ❤️ for the TRESR community.

Originally built as part of the [Avalanche Build Games](https://build.avax.network/build-games).

## Overview

Degens control the protagonist `Ron Jay`, a crypto degenerate hero in 70s-style clothing.

Ron fights against evil bankers in suits who oppose cryptocurrency.

Degens collect keys, fight enemies, and face the final boss, who definitely is not meant to look like Gary Gensler (any likeness is unintended).

The game features crypto-themed elements with real token rewards through Avalanche blockchain integration.

## Architecture

The project is almost 100% de-centralised.

- WebAssembly frontend on the Internet Computer
- Backend Economy using Avalanche C-Chain
- A custom integration known as `ic-siwa` was developed to allow signing in with Avalanche on the Internet Computer.
- Rust Serverless Functions for backend logic, verification, etc.
- Cloudflare for DNS

## Features

### Backend Features

#### User Management

- _Sign in with Avalanche_ for Authentication
- User profile management and persistent preferences
- Withdrawal address configuration
- High score tracking on a Leaderboard

#### Blockchain Integration

- **Token Fee**: Pay a fee in $TRESR to play the game
  - A portion is burnt
  - A portion goes to the Vault (rewards)
- **Reward Claims**: Defeating the boss enable you to open a Treasure Chest to claim a reward in $TRESR
- **EVM RPC Integration**: Cross-canister calls to DFINITY's EVM RPC canister allow transactions to be sent from ICP and verified on the Avalanche C-Chain.

## Development

### Prerequisites

The project uses `devenv` for a hermetic development environment. All dependencies are managed through Nix.

```bash
# Enter development environment
devenv shell

# Or use direnv (recommended)
direnv allow
```

### Tools Included

| Tool       | Version | Purpose                        |
| ---------- | ------- | ------------------------------ |
| **Bun**    | Latest  | Fast package manager & runtime |
| **Rust**   | Latest  | Backend compilation            |
| **dfx**    | Latest  | IC SDK for canister management |
| **juno**   | Latest  | Deployment and hosting         |
| **Astro**  | Latest  | Frontend Framework             |
| **Phaser** | Latest  | Game rendering and physics     |

- This project uses `bun` in place of `npm`
- This project uses `bunx` in place of `npx`

### Utilities

A wrapper script `juno-dev` serves as an entry point for all development commands enabling local development.

| Command                  | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `juno-dev setup`         | First-time setup wizard                                    |
| `juno-dev start`         | Start emulator, build, deploy, and start Astro             |
| `juno-dev stop`          | Stop all services                                          |
| `juno-dev restart`       | Stop then start                                            |
| `juno-dev status`        | Show status of running services                            |
| `juno-dev logs`          | Tail all logs (Astro, Juno, global) with colors            |
| `juno-dev rebuild`       | Rebuild Rust functions, Astro, and TypeScript declarations |
| `juno-dev update`        | Update bun and cargo dependencies                          |
| `juno-dev cleanup`       | Remove build artifacts (target/, node_modules/)            |
| `juno-dev cleanup_state` | Remove Juno CLI state files                                |

## Game Configuration

The entire game is data-driven with a single configuration file at `config/tresr.yaml`. This file is the source of truth for all generated configuration.

## Blockchain Integration Details

### EVM RPC Canister

The game leverages DFINITY's EVM RPC canister to interact with Avalanche C-Chain:

- **Canister ID**: `7hfb6-caaaa-aaaar-qadga-cai`
- **Chain**: Avalanche C-Chain (ID: 43114)
- **Methods**: Transaction verification, balance checking, token transfers

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
6. Have fun!
