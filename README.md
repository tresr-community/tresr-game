# TRESR Game

[![CI](https://github.com/tresr-community/tresr-game/actions/workflows/ci.yaml/badge.svg)](https://github.com/tresr-community/tresr-game/actions/workflows/ci.yaml)
[![CodeQL](https://github.com/tresr-community/tresr-game/actions/workflows/sec-codeql.yaml/badge.svg)](https://github.com/tresr-community/tresr-game/actions/workflows/sec-codeql.yaml)
[![Trivy](https://github.com/tresr-community/tresr-game/actions/workflows/sec-trivy.yaml/badge.svg)](https://github.com/tresr-community/tresr-game/actions/workflows/sec-trivy.yaml)

A 2.5D de-centralized platformer game hosted on the Internet Computer with an economy powered by the Avalanche Blockchain.

This is an unofficial game made for the TRESR community and is not affiliated with the official [TRESR](https://tresr.com) project.

It is made with ❤️ love ❤️ for the TRESR community.

Originally built as part of the [Avalanche Build Games](https://build.avax.network/build-games).

## Overview

Degens control the protagonist `Ron Jay`, a crypto degenerate hero.

Ron fights against evil bankers in suits who oppose cryptocurrency.

Degens collect keys, fight enemies, and face the final boss, who definitely is not meant to look like Gary Gensler (any likeness is unintended).

The game features crypto-themed elements with real token rewards through Avalanche blockchain integration.

## Architecture

The project strives to be 100% de-centralised, and is almost there.

- WebAssembly frontend on the Internet Computer
- Backend Economy powered by Avalanche Blockchain
- A custom integration known as [ic-siwa](https://github.com/irken-empire/ic-siwa) was developed to allow;
  - signing in with Avalanche on the Internet Computer
  - This makes Avalanche the single source of truth for Identity and Economy.
- Rust Serverless Functions for backend logic, verification, etc.
- Cloudflare for DNS

## Documentation

Detailed documentation is available in the `docs/` directory:

- [Blockchain Integration](docs/blockchain.md)
- [CI/CD](docs/ci-cd.md)
- [Development](docs/development.md)
- [FOMO](docs/fomo.md)
- [Features](docs/features.md)
- [Game Specification](docs/spec.md)
- [Roadmap](docs/roadmap.md)

### Avalanche Documentation

- [Solidity](docs/solidity.md)
- [Foundry Submodules](docs/submodules.md)

### Internet Computer Documentation

- [Juno Data Storage](docs/data-storage.md)
- [EVM RPC](docs/evm-rpc.md)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request
6. Have fun!
