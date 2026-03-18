# Solidity Development Guide

This guide covers Solidity development for the game's Avalanche integration.

All tools are managed via `devenv` for reproducibility (NixOS-compatible).

## First Time Setup

One-time setup to prepare your environment for Solidity development with Foundry and Anvil.

### Prerequisites

- Active `devenv shell` (includes `foundry-bin`, `solc-select`, `slither-analyzer`).
- Active `devenv shell` (includes `foundry-bin`, `solc-select`, `slither-analyzer`).
- MetaMask (or similar) browser wallet with a custom network for Anvil (chain 31337).

### Local Development Steps

- **Activate Environment**:

```bash
devenv shell
```

- **Navigate to Contracts Directory**:

```bash
# NOTE: All commands are relative to this folder.
cd contracts
```

- **Initialize Foundry Project**:

```bash
forge init
```

- **Install Dependencies**:

```bash
forge install OpenZeppelin/openzeppelin-contracts@v5.1.0
forge install foundry-rs/forge-std@v1.9.1
```

- **Configure Foundry (foundry.toml)**:

```toml
[profile.default]

src = 'src'
out = 'out'
libs = ['lib']
solc_version = '0.8.27'

[remappings]

@openzeppelin/=lib/openzeppelin-contracts/
forge-std/=lib/forge-std/src/

[rpc_endpoints]

testnet = "https://api.avax-test.network/ext/bc/C/rpc"
mainnet = "https://api.avax.network/ext/bc/C/rpc"

[etherscan]

testnet = { key = "${AVAX_KEY_TESTNET_ETHERSCAN}" }
mainnet = { key = "${AVAX_KEY_MAINNET_ETHERSCAN}" }
```

- **Set Compiler Version**:

```bash
solc-select versions
solc-select install 0.8.27
solc-select use 0.8.27
```

- **Setup Secrets (secretspec.toml)**:

```toml
[profiles.default]
AVAX_KEY_TESTNET_ETHERSCAN = { description = "Testnet key for Snowtrace", required = true }
AVAX_KEY_TESTNET_WALLET = { description = "Testnet private wallet key", required = true }
AVAX_KEY_MAINNET_ETHERSCAN = { description = "Mainnet key for Snowtrace", required = true }
AVAX_KEY_MAINNET_WALLET = { description = "Mainnet private wallet key", required = true }
```

- **Setup Devenv Environment (devenv.nix)**:

```nix
env = {
  inherit (config.secretspec.secrets)
    AVAX_KEY_TESTNET_ETHERSCAN
    AVAX_KEY_TESTNET_WALLET
    AVAX_KEY_MAINNET_ETHERSCAN
    AVAX_KEY_MAINNET_WALLET
  ;
};
```

## Local Development

Start a local development environment for iterative testing with Anvil and Foundry.

The `solidity-dev` helper script automates everything below. All addresses and config are read from `config/tresr.yaml`.

### Quick Start (Recommended)

```bash
# Start standalone Anvil, deploy contracts, fund wallet, verify — all in one shot:
solidity-dev loop

# Or step-by-step:
solidity-dev start              # Start Anvil (chain 31337)
solidity-dev deploy-token       # Deploy RonToken + TresrFaucet
solidity-dev deploy-vault       # Deploy TresrVault (UUPS proxy)
solidity-dev fund               # Mint tokens to vault + wallet
solidity-dev health             # Smoke-test: RPC, chain ID, send tx, confirm receipt
solidity-dev balance            # Show all balances
```

### Addresses

- **Mainnet $TRESR:** `0x9913BA363073Ca3e9eA0cD296E36B75aF9E40bef`
- **Anvil contracts:** Deployed fresh each session via `--deploy-token` and `--deploy-vault`. Addresses auto-update in `config/tresr.yaml`.

### Manual Anvil Setup

If you prefer to run Anvil manually instead of using the script:

```bash
# Start standalone Anvil (no fork)
anvil --port 8545 --chain-id 31337
```

Then deploy contracts manually with `forge script` or use the helper script commands.

### Browser Wallet Setup

Add a custom network in MetaMask (or your preferred wallet):

| Field                 | Value                   |
| --------------------- | ----------------------- |
| **Network Name**      | Tresr Anvil (Local)     |
| **Chain ID**          | `31337`                 |
| **Currency Name**     | Avalanche               |
| **Currency Symbol**   | AVAX                    |
| **Currency Decimals** | 18                      |
| **RPC URL**           | `http://127.0.0.1:8545` |
| **Block Explorer**    | _(leave empty)_         |

> **Important:** Do NOT use chain ID 43113 for local Anvil. MetaMask has a built-in "Avalanche Fuji" network for 43113, which would route transactions to the real Fuji RPC instead of your local Anvil.

**Import a funded account:**

- Import Anvil Account #0 (pre-funded with 10k AVAX):
  - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
- OR: Create a new account, copy its address, and run `solidity-dev fund --wallet <address>`.

### Testing

- **Run Tests**:

```bash
forge test -vvv
```

- **Security Check**:

```bash
forge fmt
slither .
```

- Launch your game app! Connect browser wallet to local RPC, test fee/claim flows.

### Additional Notes

- Use Vault.sol with NatSpec docs.
- For app testing, your SvelteKit frontend connects to <http://127.0.0.1:8545>.

## Publishing

Deploy to live networks.

### Publishing to Testnet

#### Testnet Deployment (Manual)

- **Fund Wallet** (external):
  - Get AVAX from faucets or swaps.

- **Deploy**:

```bash
forge create \
  --rpc-url $TESTNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  contracts/src/Vault.sol:TresrVault \
  --constructor-args \
    $TOKEN_ADDRESS \
    $ADMIN_ADDRESS \
    $ORACLE_ADDRESS \
    $BURN_ADDRESS \
  --verify \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $AVAX_KEY_TESTNET_ETHERSCAN
```

- **Verify**: Check <https://testnet.snowtrace.io>.

### Publishing to Mainnet

#### Mainnet Deployment (Manual)

- **Prerequisites**:
  - Audit passed, multisig set up (e.g., Gnosis Safe).
  - Test on testnet thoroughly.

- **Deploy**:

```bash
forge create \
  --rpc-url $MAINNET_RPC_URL \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  contracts/src/Vault.sol:TresrVault \
  --constructor-args \
    0x9913BA363073Ca3e9eA0cD296E36B75aF9E40bef \
    <admin> \
    <oracle> \
    $ANVIL_BURN_ADDRESS \
  --verify \
  --verifier-url https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan \
  --etherscan-api-key $AVAX_KEY_MAINNET_ETHERSCAN
```

- **Post-Deploy**: Verify on Snowtrace, renounce ownership if needed.

- Renounce ownership:

```bash
forge script \
  --rpc-url $MAINNET_RPC_URL \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  scripts/RenounceOwnership.s.sol:RenounceOwnership \
  --broadcast
```

#### CI/CD with GitHub Actions

- Use multisig for manual approval.
- Example Workflow (add to .github/workflows/):

```yaml
name: Deploy Mainnet
on:
  workflow_dispatch:
    inputs:
      confirm: {description: 'Type "yes" to deploy', required: true}
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Nix/Devenv
        run: nix-env -iA nixpkgs.devenv
      - name: Deploy
        shell: devenv shell --quiet bash -- -e {0}
        run: >
          forge create
          --rpc-url mainnet
          --private-key ${{ secrets.MAINNET_PK }}
          contracts/src/Vault.sol:TresrVault
          --constructor-args
          0x9913BA363073Ca3e9eA0cD296E36B75aF9E40bef
          <admin>
          <oracle>
          $ANVIL_BURN_ADDRESS
          --verify
        if: github.event.inputs.confirm == 'yes'
```

### Additional Sections

- **Upgrading Contracts**: Prefer immutable; use UUPS with proxy if needed.
- **Common Tasks**: Gas reports, debugging, fuzzing.
- **Resources**: Foundry Book, Slither Docs.
- **CI/CD Integration**: Root GH Actions, pre-commit hooks (exclude contracts).
