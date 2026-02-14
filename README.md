# Tresr

A 2.5D platformer game built on the Internet Computer, featuring blockchain integration with Avalanche C-Chain.

This is an unofficial game made for the tresr community and is not affiliated with the tresr project.

It is made with ❤️ love ❤️ for the tresr community.

## Overview

Tresr is a decentralized game where Degens control the hero `Ron Jay` through a cyberpunk
Tron-inspired battle grid environment featuring electric grid lines. The protagonist, a crypto
degenerate hero in 70s-style clothing with a moustache, fights against evil bankers in suits
who oppose cryptocurrency.

Degens collect keys, fight enemies, and face the final boss Gary Gensler.

The game features crypto-themed elements with real token rewards through Avalanche blockchain integration.

## Architecture

This project follows **Juno's "One Repo, One App"** architecture, where the frontend and backend are bundled together in a single satellite deployed as an ICP canister using WebAssembly.

### Tech Stack

| Component           | Technology                                     | Purpose                                             |
| ------------------- | ---------------------------------------------- | --------------------------------------------------- |
| **Frontend**        | Astro + Phaser + Vanilla TypeScript + Tailwind | Game UI, rendering, and user interface              |
| **Functions**       | Rust (Juno Serverless Functions)               | Game logic, user management, blockchain integration |
| **Authentication**  | Juno + Internet Identity                       | Decentralized user authentication                   |
| **Blockchain**      | Internet Computer (ICP)                        | Host platform                                       |
| **EVM Integration** | Avalanche C-Chain via EVM RPC Canister         | Token deposits and withdrawals                      |
| **Development**     | devenv (Nix)                                   | Hermetic development environment                    |

### TypeScript Components

- **auth**: Authentication module (Internet Identity integration)
- **game**: Game logic and rendering (Phaser-based)
- **notifications**: Notification system for game events
- **wallet**: EVM wallet integration (Avalanche C-Chain)
- **utilities**: Helper functions and utilities

### Rust Functions

- Serverless functions for backend logic, database operations, etc.

### Project Structure

```text
tresr-game/
├── src/
│   ├── satellite/              # Rust Backend (Serverless Functions)
│   │   ├── src/
│   │   │   ├── lib.rs                # Main entry point
│   │   │   ├── types.rs              # Data types
│   │   │   ├── authorization.rs      # Access control
│   │   │   ├── evm_rpc.rs           # Avalanche integration
│   │   │   └── services.rs          # Business logic
│   │   ├── satellite.did            # Candid interface
│   │   └── Cargo.toml
│   ├── lib/                 # TypeScript Libraries and Modules
│   │   ├── auth/            # Authentication module
│   │   ├── config/          # Configuration utilities
│   │   ├── game/            # Game logic and Phaser rendering
│   │   ├── metrics/         # Analytics and metrics
│   │   ├── notifications/   # Notification system
│   │   ├── utils/           # Utility functions
│   │   └── wallet/          # EVM wallet integration
│   ├── components/          # Astro & UI components
│   │   ├── ui/              # DaisyUI-based UI components
│   │   └── ...              # Other components
│   ├── layouts/             # Astro page layouts
│   ├── pages/               # Astro pages
│   │   └── index.astro      # Main entry point
│   └── styles/              # Global styles (Tailwind + DaisyUI)
├── public/
│   ├── assets/              # Static game assets
│   └── config-public.json   # Game configuration
├── Cargo.toml               # Rust workspace
├── package.json             # Frontend dependencies
├── juno.config.mjs          # Juno configuration
├── astro.config.mjs         # Astro configuration
└── devenv.nix              # Development environment

```

## Features

### Game Mechanics

- **2.5D Platformer**: Tron-inspired cyberpunk environment with depth sorting
- **Character Controls**: WASD/Arrow keys for movement, Space for punch, Enter for super attack
- **Combat System**: Fight bankers, avoid red candle bombs, defeat Gary Gensler boss
- **Collectibles**: Gather 150 keys throughout the level
- **Super Attack**: "Green Trading Candle" activated when meter is full
- **Timer System**: 5-minute countdown to boss fight
- **Victory Conditions**: Collect treasure chest and complete level

### Backend Features

#### User Management

- Internet Identity authentication
- User profile management
- Withdrawal address configuration
- High score tracking
- Game progress persistence

#### Blockchain Integration

- **Token Deposits**: Verify Avalanche C-Chain transactions
- **Reward Claims**: Send tokens to withdrawal addresses
- **EVM RPC Integration**: Cross-canister calls to DFINITY's EVM RPC canister
- **Transaction Verification**: Parse and validate blockchain transactions

#### Authorization

- Role-based access control (Admin/User)
- Secure profile access
- Admin functions for user management

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

### Quick Start

1. **Clone the repository**

```bash
git clone <repository-url>
cd tresr-game
```

1. **Enter development environment**

```bash
devenv shell
# Or use direnv (recommended): direnv allow
```

1. **First-time setup** (creates your local Juno satellite)

```bash
# Terminal 1: Start log viewer (optional but recommended)
juno-dev logs

# Terminal 2: Run the setup wizard
juno-dev setup
```

The setup wizard will:

- Start the Juno emulator
- Guide you to create a satellite at <http://localhost:5866>
- Prompt you to copy the Satellite ID

1. **Configure your environment**

```bash
# Add your satellite ID to .env
SATELLITE_ID=put_your_satellite_id_here

# Take a copy of the dotenv template
cp .env.example .env

# Add your satellite ID to .env
sed -i "s/your-satellite-id-here/$SATELLITE_ID/g" .env

# Reload the environment to pick up the new variable
direnv reload
# Or: export VITE_SATELLITE_ID=$SATELLITE_ID
```

1. **Start the development environment**

```bash
juno-dev start
```

This will:

- Start the Juno emulator (Docker container)
- Build Rust serverless functions
- Deploy to the local satellite
- Generate TypeScript declarations from Candid
- Start the Astro dev server at <http://localhost:4321>

Access points:

- **Frontend**: <http://localhost:4321>
- **Juno Console**: <http://localhost:5866>

### juno-dev Commands

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

### Manual Workflow (Alternative)

If you prefer to run commands manually:

```bash
# Terminal 1: Start Juno Emulator
juno emulator start --headless --lang rust

# Terminal 2: Build & Deploy
juno functions build --lang rust
juno deploy --local --mode development

# Terminal 3: Start Frontend
bun run dev
```

## Game Configuration

All game parameters are configurable in `public/config-public.json`:

```json
{
  "app": {
    "version": "0.0.0",
    "name": "Tresr Community Game",
    "tagline": "Collect Keys. Fight Enemies. Claim the Treasure.",
    "footer_text": "Powered by the Internet Computer and Avalanche Blockchains",
    "instructions": "Expanded markdown with super attack, emojis"
  },
  "blockchain": {
    "avalanche": {
      "fee": 10,
      "chain_id": 43114,
      "rpc": "...",
      "token_ticker": "TRESR",
      "token_contract": "0x...",
      "vault_contract": "0x..."
    },
    "icp": {
      "evm_rpc_canister_id": "7hfb6-caaaa-aaaar-qadga-cai"
    }
  },
  "gameplay": {
    "time_limit_seconds": 300,
    "max_keys": 150
  },
  "player": {
    "initial_position": {"x": 50, "y": 300},
    "movement_speed": 4.5,
    "jump_force": 12,
    "gravity": 1.5
  }
}
```

## Blockchain Integration Details

### EVM RPC Canister

The game uses DFINITY's EVM RPC canister to interact with Avalanche C-Chain:

- **Canister ID**: `7hfb6-caaaa-aaaar-qadga-cai`
- **Chain**: Avalanche C-Chain (ID: 43114)
- **Methods**: Transaction verification, balance checking, token transfers

### Token Flow

1. **Deposit**: User sends tokens to game contract on Avalanche
2. **Verification**: Backend verifies transaction via EVM RPC
3. **Credit**: Balance updated in user profile
4. **Gameplay**: Player earns additional tokens through gameplay
5. **Claim**: User withdraws tokens to their Avalanche address

## Authentication

### Internet Identity

Users authenticate via Internet Identity:

- Decentralized authentication
- No passwords or personal data
- Works across all Internet Computer apps
- Managed through Juno's auth integration

### Guest Mode

Players can try the game without authentication:

- No blockchain features
- No progress saving
- Local session only
- Full gameplay experience

## Deployment

### Local Development

```bash
# Start Juno local environment
juno dev

# Deploy to local satellite
juno deploy --local
```

### Production Deployment

1. **Create Juno Satellite** at <https://console.juno.build>

1. **Update juno.config.mjs**

```typescript
export default defineConfig({
  satellite: {
    ids: {
      production: "your-production-satellite-id",
    },
    source: "dist",
    predeploy: ["bun run build"],
  },
});
```

1. **Set environment variables**

```bash
# .env.production
VITE_SATELLITE_ID=your-production-satellite-id
VITE_IC_HOST=https://ic0.app
```

1. **Deploy**

```bash
bun run build
juno deploy
```

## Security

### Best Practices

- ✅ Never hardcode private keys or principals
- ✅ All backend calls require authentication
- ✅ Admin functions protected by role-based access control
- ✅ Input validation on all user data
- ✅ Secure token transaction verification
- ✅ Hermetic development environment via devenv

### Access Control

The backend implements role-based access control:

```rust
// User level - requires authentication
pub fn assert_authenticated() -> Result<(), String>

// Admin level - requires admin principal
pub fn assert_admin() -> Result<(), String>
```

Set admin principal in `src/satellite/src/lib.rs`.

## Testing

### Frontend Testing

```bash
# Run tests
bun test

# Run with coverage
bun test --coverage
```

### Backend Testing

```bash
# Run Rust tests
cargo test --manifest-path src/satellite/Cargo.toml
```

### Manual Testing Checklist

- [ ] Internet Identity login works
- [ ] Guest mode works
- [ ] Profile creation and updates
- [ ] Game controls responsive
- [ ] Progress saves correctly
- [ ] High scores update
- [ ] Deposit verification (testnet)
- [ ] Withdrawal sending (testnet)

## Troubleshooting

### Common Issues

#### "Satellite ID not configured"

- Run `juno dev` to create a satellite
- Copy ID to `.env` file
- Restart dev server

#### "Failed to build satellite functions"

```bash
rustup target add wasm32-unknown-unknown
cargo clean
juno functions build
```

#### "Module not found: declarations/satellite"

```bash
didc bind src/satellite/satellite.did -t ts > src/declarations/satellite/index.ts
```

#### "EVM RPC call failed"

- Check canister ID: `7hfb6-caaaa-aaaar-qadga-cai`
- Verify sufficient cycles
- Test with Avalanche Fuji testnet first

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Resources

### Documentation

- **Juno**: <https://juno.build/docs>
- **Internet Computer**: <https://internetcomputer.org/docs>
- **EVM RPC Canister**: <https://internetcomputer.org/docs/building-apps/chain-fusion/ethereum/evm-rpc/overview>
- **Avalanche**: <https://docs.avax.network>
- **Phaser**: <https://phaser.io/phaser3>

### Community

- **Juno Discord**: <https://discord.gg/wHZ57Z2RAG>
- **ICP Developer Forum**: <https://forum.dfinity.org>

## License

See [LICENSE](LICENSE) file for details.

---

Built with ❤️ on the Internet Computer
