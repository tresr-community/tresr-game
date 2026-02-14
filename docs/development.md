# Development

## Prerequisites

The project uses `devenv` for a hermetic development environment. All dependencies are managed through Nix.

```bash
# Enter development environment
devenv shell

# Or use direnv (recommended)
direnv allow
```

### Tools Included

| Tool      | Version | Purpose                        |
| --------- | ------- | ------------------------------ |
| **Astro** | Latest  | Frontend Framework             |
| **Bun**   | Latest  | Fast package manager & runtime |
| **Rust**  | Latest  | Backend compilation            |
| **dfx**   | Latest  | IC SDK for canister management |
| **juno**  | Latest  | Deployment and hosting         |

**NOTE:** A shortcut wrapper script `juno-dev` is provided for convenience.

## Quick Start

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
- Start the Juno Console
- Start the Satellite

Access points:

- **Frontend**: <http://localhost:4321>
- **Juno Console**: <http://localhost:5866>

## juno-dev Commands

| Command                  | Description                                                |
| ------------------------ | ---------------------------------------------------------- |
| `juno-dev setup`         | Setup wizard only used on first-run                        |
| `juno-dev start`         | Start emulator, build, deploy, and start Astro             |
| `juno-dev stop`          | Stop all services                                          |
| `juno-dev restart`       | Stop then start                                            |
| `juno-dev status`        | Show status of running services                            |
| `juno-dev logs`          | Tail all logs (Astro, Juno, global) with colors            |
| `juno-dev rebuild`       | Rebuild Rust functions, Astro, and TypeScript declarations |
| `juno-dev update`        | Update bun and cargo dependencies                          |
| `juno-dev cleanup`       | Remove build artifacts (target/, node_modules/)            |
| `juno-dev cleanup_state` | Remove Juno CLI state files                                |

## Manual Workflow (Alternative)

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
