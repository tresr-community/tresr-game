# Architecture

This project follows **Juno's "One Repo, One App"** architecture, where the frontend and backend are bundled together in a single satellite deployed as an ICP canister using WebAssembly.

## Tech Stack

| Component           | Technology                             | Purpose                                             |
| ------------------- | -------------------------------------- | --------------------------------------------------- |
| **Frontend**        | Astro + Vanilla TypeScript + Tailwind  | Game UI and user interface                          |
| **Functions**       | Rust (Juno Serverless Functions)       | Game logic, user management, blockchain integration |
| **Authentication**  | Juno + Internet Identity               | Decentralized user authentication                   |
| **Blockchain**      | Internet Computer (ICP)                | Host platform                                       |
| **EVM Integration** | Avalanche C-Chain via EVM RPC Canister | Token fees and withdrawals                          |
| **Development**     | devenv (Nix)                           | Hermetic development environment                    |
| **Game Engine**     | Phaser                                 | Game logic, physics, rendering                      |
