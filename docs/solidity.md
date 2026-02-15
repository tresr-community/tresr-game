# Solidity Development Guide

This guide covers Solidity development for the game's Avalanche integration.

All tools are managed via `devenv` for reproducibility (NixOS-compatible).

## First Time Setup

One-time setup to prepare your environment for Solidity development with Foundry and Anvil.

### Prerequisites

- Active `devenv shell` (includes `foundry-bin`, `solc-select`, `slither-analyzer`).
- Metamask wallet with Fuji/Mainnet AVAX and $TRESR (testnet only).
- Access to Avalanche faucets (Fuji: <https://faucet.avax.network>).

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

fuji = "https://api.avax-test.network/ext/bc/C/rpc"
mainnet = "https://api.avax.network/ext/bc/C/rpc"

[etherscan]

fuji = { key = "${AVAX_KEY_TESTNET_ETHERSCAN}" }
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
AVAX_KEY_TESTNET_ETHERSCAN = { description = "Testnet (Fuji) key for Snowtrace", required = true }
AVAX_KEY_TESTNET_WALLET = { description = "Testnet (Fuji) private wallet key", required = true }
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

### Addresses

- **Mainnet $TRESR:** 0x9913BA363073Ca3e9eA0cD296E36B75aF9E40bef
- **Fuji Testnet $tTRESR:** 0x6EB523A381e725F115b7454BaA3cb199E4770970
- **Custom Vault Contract:** See config/tresr.yaml for anvil.vault_contract (update after deploy).

### Setup and Deployment Steps

- **Set Environment Variables** (run once per session):

```bash
# Anvil admin wallet address and private key
export ANVIL_ADMIN_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export ANVIL_ADMIN_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Anvil accounts
export ANVIL_TOKEN_ADDRESS="0xB710d0603d82302c0F72E2bA066BB7baf2C731fe"
export ANVIL_TOKEN_TREASURY="0x533d95Fa7D5CEd8f09e38aa359E406A3809Bc0e0"

# Where to get AVAX from
export FUJI_AVAX_FAUCET="0x2352D20fC81225c8ECD8f6FaA1B37F24FEd450c9"

# The oracle contract address
export ANVIL_ORACLE_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

# The burn address for testing
export ANVIL_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"

# The RPC URLs for different networks
export ANVIL_RPC_URL="http://127.0.0.1:8545"
export FUJI_RPC_URL="https://api.avax-test.network/ext/bc/C/rpc"
export MAINNET_RPC_URL="https://api.avax.network/ext/bc/C/rpc"
```

- **Start Anvil (Forked Testnet for Real $tTRESR)**:

```bash
anvil --port 8545 --fork-url $FUJI_RPC_URL --chain-id 43113
```

- Alternative (Fully Offline) use: `anvil --port 8545`

- Open a new terminal, export the same session variables and;

- **Impersonate the Treasury** so we can take some $tTRESR:

```bash
# See how much $tTRESR the Treasury has.
cast call \
    $ANVIL_TOKEN_ADDRESS \
    "balanceOf(address)(uint256)" \
    $ANVIL_TOKEN_TREASURY \
    --rpc-url $ANVIL_RPC_URL

# Impersonate the Treasury.
cast rpc \
    anvil_impersonateAccount $ANVIL_TOKEN_TREASURY\
    --rpc-url $ANVIL_RPC_URL

# Pillage some $tTRESR from the Treasury.
cast send \
    $ANVIL_TOKEN_ADDRESS \
    "transfer(address,uint256)" \
    $ANVIL_ADMIN_ADDRESS \
    "100000000000000000000000" \
    --from $ANVIL_TOKEN_TREASURY \
    --rpc-url $ANVIL_RPC_URL \
    --unlocked

# Stop impersonating the Treasury.
cast rpc \
    anvil_stopImpersonatingAccount $ANVIL_TOKEN_TREASURY\
    --rpc-url $ANVIL_RPC_URL
```

- **Check the Wallet balance for $tTRESR:**

```bash
cast call \
    $ANVIL_TOKEN_ADDRESS \
    "balanceOf(address)(uint256)" \
    $ANVIL_ADMIN_ADDRESS \
    --rpc-url $ANVIL_RPC_URL
```

- **Deploy Vault** Contract:

```bash
# Dry Run
forge create \
  --rpc-url $ANVIL_RPC_URL \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  src/Vault.sol:TresrVault \
  --constructor-args \
    $ANVIL_TOKEN_ADDRESS \
    $ANVIL_ADMIN_ADDRESS \
    $ANVIL_ORACLE_ADDRESS \
    $ANVIL_BURN_ADDRESS

# Broadcast it to Anvil and capture the 'Deployed To' address.
forge create \
  --rpc-url $ANVIL_RPC_URL \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  src/Vault.sol:TresrVault \
  --broadcast \
  --constructor-args \
    $ANVIL_TOKEN_ADDRESS \
    $ANVIL_ADMIN_ADDRESS \
    $ANVIL_ORACLE_ADDRESS \
    $ANVIL_BURN_ADDRESS \
```

- **Set the **ANVIL_VAULT_ADDRESS** variable to the deployed address.**

```bash
# This is the "Deployed To" address from the previous command
export ANVIL_VAULT_ADDRESS="0x54AE79264B79855454A8fEC913d6352907e6FA10"
```

- **Update Config for App Testing**:
  - In config/tresr.yaml, set anvil.vault_contract to deployed address.

- **Approve $tTRESR fees from the admin Wallet into the Vault**:

```bash
cast send \
  $ANVIL_TOKEN_ADDRESS \
  "approve(address,uint256)" \
  ${ANVIL_VAULT_ADDRESS} \
  "115792089237316195423570985008687907853269984665640564039457584007913129639935" \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  --rpc-url $ANVIL_RPC_URL
```

- **Test a Game Fee Payment from the Admin Wallet**:

```bash
# Use a random session id to simulate a game fee payment
export SESSION_ID="0x$(openssl rand -hex 32)"

# Pay the fee
cast send \
  ${ANVIL_VAULT_ADDRESS} \
  "payFee(uint256,bytes32)" \
  "1000000000000000000" \
  "$SESSION_ID" \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  --rpc-url $ANVIL_RPC_URL
```

- **Run Tests**:

```bash
forge test -vvv
```

- **Security Check**:

```bash
forge fmt
slither .
```

- Now, **Setup your Browser Wallet** to use Anvil RPC:

  Install MetaMask, Brave Wallet, or another browser wallet and add a custom network.

  The values depend on which Anvil mode you started:

  **Fuji Fork** (`--start --network fuji` / `anvil --fork-url $FUJI_RPC_URL --chain-id 43113`):

  | Field                 | Value                                                               |
  | --------------------- | ------------------------------------------------------------------- |
  | **Network Name**      | Tresr Anvil (Fuji Fork)                                             |
  | **Chain ID**          | `43113`                                                             |
  | **Currency Name**     | Avalanche                                                           |
  | **Currency Symbol**   | AVAX                                                                |
  | **Currency Decimals** | 18                                                                  |
  | **RPC URL**           | `http://127.0.0.1:8545`                                             |
  | **Block Explorer**    | `https://testnet.snowtrace.io` (optional, for link formatting only) |

  **Local Only** (`--start --network local` / `anvil --chain-id 31337`):

  | Field                 | Value                   |
  | --------------------- | ----------------------- |
  | **Network Name**      | Tresr Anvil (Local)     |
  | **Chain ID**          | `31337`                 |
  | **Currency Name**     | Ether                   |
  | **Currency Symbol**   | ETH                     |
  | **Currency Decimals** | 18                      |
  | **RPC URL**           | `http://127.0.0.1:8545` |
  | **Block Explorer**    | _(leave empty)_         |

  > **Note:** Fuji Fork mode gives you access to real $tTRESR on the forked chain.
  > Local Only has no $tTRESR contract — only useful for pure Solidity unit testing.

  **Import a funded account** (both modes):
  - Import Anvil Account #0 (pre-funded with 10k ETH/AVAX):
    - Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
  - OR: Create a new account in your wallet, copy its address, and fund it (see below).

- **Send $tTRESR to your browser wallet from the Admin Wallet**:

```bash
# Get browser wallet address (e.g., from MetaMask).
export BROWSER_WALLET_ADDRESS="0xb81749c72db5b5209098f2bd45a7a0293925da13"

# Send 10k $tTRESR to browser wallet.
cast send \
  $ANVIL_TOKEN_ADDRESS \
  "transfer(address,uint256)" \
  $BROWSER_WALLET_ADDRESS \
  "10000000000000000000000" \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  --rpc-url $ANVIL_RPC_URL

# Verify balance.
cast call \
  $ANVIL_TOKEN_ADDRESS \
  "balanceOf(address)(uint256)" \
  $BROWSER_WALLET_ADDRESS \
  --rpc-url $ANVIL_RPC_URL
```

- Launch your game app! Connect browser wallet to local RPC, test fee/claim flows.

### Additional Notes

- Use Vault.sol with NatSpec docs.
- For app testing, your Astro frontend connects to <http://127.0.0.1:8545>.

## Publishing

Deploy to live networks.

### Publishing to Fuji Testnet

#### Fuji Testnet Deployment (Manual)

- **Fund Wallet** (external):
  - Get AVAX/ tTRESR from faucets or swaps.

- **Deploy**:

```bash
forge create \
  --rpc-url $FUJI_RPC_URL \
  --private-key $ANVIL_ADMIN_PRIVATE_KEY \
  contracts/src/Vault.sol:TresrVault \
  --constructor-args \
    $ANVIL_TOKEN_ADDRESS \
    $ANVIL_ADMIN_ADDRESS \
    $ANVIL_ORACLE_ADDRESS \
    $ANVIL_BURN_ADDRESS \
  --verify \
  --verifier-url https://api.routescan.io/v2/network/testnet/evm/43113/etherscan \
  --etherscan-api-key $AVAX_KEY_TESTNET_ETHERSCAN
```

- **Verify**: Check <https://testnet.snowtrace.io>.

### Publishing to Mainnet

#### Mainnet Deployment (Manual)

- **Prerequisites**:
  - Audit passed, multisig set up (e.g., Gnosis Safe).
  - Test Fuji thoroughly.

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
