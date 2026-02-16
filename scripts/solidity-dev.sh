#!/usr/bin/env bash

clear
set -euo pipefail

# =============================================================================
# Solidity Dev Script
# =============================================================================

export NC=$'\033[0m'
export GREEN=$'\033[0;32m'
export RED=$'\033[0;31m'
export YELLOW=$'\033[1;33m'
export CYAN=$'\033[0;36m'
export BLUE=$'\033[0;34m'

export FOUNDRY_DISABLE_NIGHTLY_WARNING=true

function log_info() {
	echo -e "${GREEN}[INFO]${NC} $*"
}
function log_warn() {
	echo -e "${YELLOW}[WARN]${NC} $*"
}
function log_error() {
	echo -e "${RED}[ERROR]${NC} $*"
}

# =============================================================================
# Constants
# =============================================================================

CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config/tresr.yaml"

# Anvil — standalone, no fork
ANVIL_PORT="8545"
ANVIL_PID=""
ANVIL_RPC_URL="http://127.0.0.1:${ANVIL_PORT}"
ANVIL_CHAIN_ID="31337"

# Addresses — loaded from config/tresr.yaml by load_config()
ANVIL_ADMIN_ADDRESS=""
ANVIL_TOKEN_ADDRESS=""
PLAYER_WALLET=""
TOKEN_TICKER=""

# Zero address (vault not deployed)
ZERO_ADDRESS="0x0000000000000000000000000000000000000000"

# =============================================================================
# Config Loader — single source of truth from tresr.yaml
# =============================================================================

function load_config() {
	if ! command -v yq &>/dev/null; then
		log_error "yq is required but not found. Install it: https://github.com/mikefarah/yq"
		exit 1
	fi

	if [[ ! -f $CONFIG_FILE ]]; then
		log_error "Config file not found: ${CONFIG_FILE}"
		exit 1
	fi

	ANVIL_ADMIN_ADDRESS=$(yq -r '.client.blockchain.avalanche.anvil.deployer_address' "$CONFIG_FILE")
	ANVIL_TOKEN_ADDRESS=$(yq -r '.client.blockchain.avalanche.anvil.tresr_token_contract' "$CONFIG_FILE")
	PLAYER_WALLET=$(yq -r '.client.blockchain.avalanche.anvil.player_wallet' "$CONFIG_FILE")
	TOKEN_TICKER=$(yq -r '.client.blockchain.avalanche.anvil.token_ticker' "$CONFIG_FILE")

	# Private key from env (managed by secretspec), NOT hardcoded
	if [[ -z ${DEPLOYER_PRIVATE_KEY:-} ]]; then
		# Fallback to well-known Anvil account #0 for local dev only
		DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
		log_warn "DEPLOYER_PRIVATE_KEY not set, using Anvil default account #0"
	fi

	log_info "Config loaded from ${CYAN}${CONFIG_FILE}${NC}"
}

function verify_config() {
	local missing=0

	local -A required=(
		[ANVIL_ADMIN_ADDRESS]="$ANVIL_ADMIN_ADDRESS"
		[ANVIL_TOKEN_ADDRESS]="$ANVIL_TOKEN_ADDRESS"
		[PLAYER_WALLET]="$PLAYER_WALLET"
		[TOKEN_TICKER]="$TOKEN_TICKER"
		[DEPLOYER_PRIVATE_KEY]="$DEPLOYER_PRIVATE_KEY"
	)

	for key in "${!required[@]}"; do
		local val="${required[$key]}"
		if [[ -z $val || $val == "null" ]]; then
			log_error "Missing config: ${YELLOW}${key}${NC}"
			((missing++))
		fi
	done

	if ((missing > 0)); then
		log_error "Pre-flight check failed — ${missing} missing config value(s). Check ${CYAN}${CONFIG_FILE}${NC}"
		exit 1
	fi

	log_info "Pre-flight check ${GREEN}passed${NC}"
}

# =============================================================================
# YAML helpers — sed for writes (preserves formatting), yq for verification
# =============================================================================

# yaml_set KEY VALUE — update the anvil section of tresr.yaml, then verify.
# Uses sed to preserve multiline fields; verifies with yq to catch silent failures.
function yaml_set() {
	local key="$1"
	local value="$2"

	# Targeted sed: only match within the /anvil:/,/testnet:/ range
	# Handles both quoted ("0x...") and unquoted (tRON) values
	sed -i "/anvil:/,/testnet:/ s|${key}: .*|${key}: \"${value}\"|" "$CONFIG_FILE"

	# Read back via yq to verify the write landed
	local actual
	actual=$(yq -r ".client.blockchain.avalanche.anvil.${key}" "$CONFIG_FILE" 2>/dev/null || echo "")
	if [[ $actual != "$value" ]]; then
		log_error "YAML update failed: ${key} is '${actual}' but expected '${value}'"
		log_error "  File: ${CONFIG_FILE}"
		exit 1
	fi
}

# =============================================================================
# Help
# =============================================================================

function show_help() {
	echo -e "${CYAN}Solidity Dev${NC} — Solidity development helper"
	echo ""
	echo "Usage: solidity-dev <command> [options]"
	echo ""
	echo "Commands:"
	echo "  check                     Run all Solidity checks (fmt, slither, build, test)"
	echo "  start   [--wallet ADDR]   Start standalone Anvil (chain 31337), fund wallet, tail logs"
	echo "  stop                      Stop any running Anvil instance"
	echo "  loop    [--wallet ADDR]   One-shot: deploy-token → deploy-vault → fund → health"
	echo "  fund    [--wallet ADDR]   Mint tokens to vault + wallet (Anvil must be running)"
	echo "  health                    Smoke-test Anvil: RPC, chain ID, send tx, confirm receipt"
	echo "  balance [--wallet ADDR]   Show token + AVAX balance for an address"
	echo "  deploy-token              Deploy RonToken + TresrFaucet to Anvil (run FIRST)"
	echo "  deploy-vault              Deploy Vault contract to Anvil (run AFTER deploy-token)"
	echo "  help                      Show this help message"
	echo ""
	echo "Options:"
	echo "  --wallet  0x...   Player wallet for funding (default: from tresr.yaml)"
}

# =============================================================================
# Check
# =============================================================================

function run_check() {
	log_info "Running Solidity checks..."
	cd contracts
	export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

	forge fmt || {
		log_error "Forge format validation has failed!"
		exit 1
	}
	slither . || {
		log_error "Slither validation has failed!"
		exit 1
	}
	forge build \
		--names \
		--sizes \
		--force ||
		{
			log_error "Forge build validation has failed!"
			exit 1
		}
	forge test \
		-vvv \
		--summary \
		--detailed \
		--force ||
		{
			log_error "Forge test validation has failed!"
			exit 1
		}
	log_info "Solidity code is valid!"
}

# =============================================================================
# Start — Launch Anvil, fund wallets, tail logs
# =============================================================================

function cleanup_anvil() {
	echo ""
	log_info "Shutting down Anvil..."
	if [[ -n $ANVIL_PID ]] && kill -0 "$ANVIL_PID" 2>/dev/null; then
		kill "$ANVIL_PID" 2>/dev/null || true
		wait "$ANVIL_PID" 2>/dev/null || true
	fi
	log_info "Anvil stopped."
}

function wait_for_anvil() {
	local retries=30
	log_info "Waiting for Anvil RPC on port ${ANVIL_PORT}..."
	for ((i = 1; i <= retries; i++)); do
		if cast block-number --rpc-url "$ANVIL_RPC_URL" >/dev/null 2>&1; then
			log_info "Anvil is ready."
			return 0
		fi
		sleep 1
	done
	log_error "Anvil did not respond after ${retries}s."
	return 1
}

function fund_wallet() {
	local wallet_address="$1"

	log_info "Funding wallet: ${CYAN}${wallet_address}${NC}"

	# Read vault address from config (anvil environment)
	local vault_address
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.vault_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
	local vault_deployed=false
	if [[ -n $vault_address && $vault_address != "$ZERO_ADDRESS" ]]; then
		vault_deployed=true
		log_info "Vault contract: ${CYAN}${vault_address}${NC}"
	else
		log_warn "Vault contract not deployed — all funds go to browser wallet."
	fi

	# Amount to fund per call (10,000 tokens)
	local fund_amount="10000000000000000000000" # 10,000e18
	local fund_human="10,000.00"

	# Use deployer (who is owner of RonToken) to mint fresh tokens.
	log_info "Minting ${GREEN}${fund_human}${NC} $TOKEN_TICKER via deployer..."

	# Calculate splits
	local vault_amount="0"
	local wallet_amount="$fund_amount"
	if [[ $vault_deployed == true ]]; then
		vault_amount=$(echo "$fund_amount / 2" | bc)
		wallet_amount=$(echo "$fund_amount - $vault_amount" | bc)
		local vault_human_split wallet_human_split
		vault_human_split=$(cast from-wei "$vault_amount" 2>/dev/null || echo "$vault_amount")
		vault_human_split=$(printf "%'.2f" "$vault_human_split")
		wallet_human_split=$(cast from-wei "$wallet_amount" 2>/dev/null || echo "$wallet_amount")
		wallet_human_split=$(printf "%'.2f" "$wallet_human_split")
		log_info "Splitting: ${GREEN}${vault_human_split}${NC} → vault, ${GREEN}${wallet_human_split}${NC} → wallet"
	fi

	# Mint to vault
	if [[ $vault_deployed == true && $vault_amount != "0" ]]; then
		log_info "Minting → vault (${vault_amount} wei)..."
		cast send \
			"$ANVIL_TOKEN_ADDRESS" \
			"mint(address,uint256)" \
			"$vault_address" \
			"$vault_amount" \
			--private-key "$DEPLOYER_PRIVATE_KEY" \
			--rpc-url "$ANVIL_RPC_URL" >/dev/null
	fi

	# Mint to wallet
	log_info "Minting → wallet (${wallet_amount} wei)..."
	cast send \
		"$ANVIL_TOKEN_ADDRESS" \
		"mint(address,uint256)" \
		"$wallet_address" \
		"$wallet_amount" \
		--private-key "$DEPLOYER_PRIVATE_KEY" \
		--rpc-url "$ANVIL_RPC_URL" >/dev/null

	# Fund wallet with native AVAX for gas (add 10 AVAX to current balance)
	local current_avax_balance
	current_avax_balance=$(cast balance "$wallet_address" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "0")
	local new_avax_balance
	new_avax_balance=$(echo "$current_avax_balance + 10000000000000000000" | bc)
	local new_avax_hex
	new_avax_hex="0x$(echo "obase=16; $new_avax_balance" | bc)" # cspell:disable-line
	log_info "Adding 10 AVAX to wallet gas balance..."
	cast rpc anvil_setBalance \
		"$wallet_address" \
		"$new_avax_hex" \
		--rpc-url "$ANVIL_RPC_URL" >/dev/null

	log_info "${GREEN}Funding complete!${NC}"
}

function run_start() {
	local wallet="$PLAYER_WALLET"

	# Parse start sub-options
	shift || true
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--wallet)
			wallet="${2:?'--wallet requires an address'}"
			shift 2
			;;
		*)
			log_error "Unknown start option: $1"
			show_help
			exit 1
			;;
		esac
	done

	# Ensure no existing anvil on this port
	if lsof -i ":${ANVIL_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
		log_error "Port ${ANVIL_PORT} is already in use. Run 'stop' first."
		exit 1
	fi

	# Trap signals for cleanup
	trap cleanup_anvil EXIT INT TERM

	# Start standalone Anvil (no fork)
	log_info "Starting Anvil on port ${ANVIL_PORT} (chain ${ANVIL_CHAIN_ID})..."
	anvil --port "$ANVIL_PORT" --chain-id "$ANVIL_CHAIN_ID" &
	ANVIL_PID=$!

	# Wait for RPC to be ready
	if ! wait_for_anvil; then
		log_error "Anvil failed to start."
		exit 1
	fi

	# Fund the browser wallet
	fund_wallet "$wallet"

	# Banner
	cat <<-EOF

		${CYAN}==============================================================================${NC}
		${CYAN}   Anvil is running (standalone, chain ${ANVIL_CHAIN_ID})${NC}
		${CYAN}==============================================================================${NC}

		  RPC URL:    ${GREEN}${ANVIL_RPC_URL}${NC}
		  Chain ID:   ${GREEN}${ANVIL_CHAIN_ID}${NC}
		  Wallet:     ${GREEN}${wallet}${NC}

		  Press ${YELLOW}CTRL+C${NC} to stop Anvil.

		${CYAN}==============================================================================${NC}

	EOF

	# Tail Anvil stdout (wait blocks until the process exits)
	wait "$ANVIL_PID"
}

# =============================================================================
# Fund — Send more tokens to a wallet (Anvil must be running)
# =============================================================================

function assert_anvil_running() {
	# Primary check: can we actually talk to the RPC?
	if ! cast block-number --rpc-url "$ANVIL_RPC_URL" >/dev/null 2>&1; then
		log_error "Anvil is not running on port ${ANVIL_PORT}."
		log_error "Start it first with: solidity-dev --start"
		exit 1
	fi
}

function run_fund() {
	local wallet="$PLAYER_WALLET"

	# Parse fund sub-options
	shift || true
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--wallet)
			wallet="${2:?'--wallet requires an address'}"
			shift 2
			;;
		*)
			log_error "Unknown fund option: $1"
			show_help
			exit 1
			;;
		esac
	done

	assert_anvil_running
	fund_wallet "$wallet"

	log_info "Done! Wallet ${CYAN}${wallet}${NC} has been funded."
}

# =============================================================================
# Regenerate client config — keep frontend in sync with tresr.yaml
# =============================================================================

function regen_client_config() {
	local project_root
	project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
	local config_script="${project_root}/bin/client-config.ts"

	if [[ ! -f $config_script ]]; then
		log_warn "client-config.ts not found — skipping frontend config regeneration."
		return 0
	fi

	log_info "Regenerating ${CYAN}src/lib/config/client.ts${NC} from tresr.yaml..."
	(cd "$project_root" && bunx tsx "$config_script") || {
		log_warn "Failed to regenerate client config (non-fatal)."
		return 0
	}
	log_info "Frontend config regenerated ${GREEN}successfully${NC}."
}

# =============================================================================
# Deploy Vault — Deploy Vault contract to Anvil
# =============================================================================

# Burn address for testing
ANVIL_BURN_ADDRESS="0x000000000000000000000000000000000000dEaD"

function run_deploy() {
	# Oracle address for local dev (same as admin — Anvil account #0)
	# Must be set here (not at top-level) because ANVIL_ADMIN_ADDRESS
	# is populated by load_config() which runs after script parse.
	local ANVIL_ORACLE_ADDRESS="$ANVIL_ADMIN_ADDRESS"

	assert_anvil_running

	log_info "Building and deploying TresrVault (UUPS proxy) to Anvil..."

	cd contracts
	export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

	# Build first to catch compile errors
	forge build --force || {
		log_error "Forge build failed!"
		exit 1
	}

	# Deploy via script (implementation + proxy)
	# Temporarily disable set -e so we can capture output AND exit code
	local deploy_output
	local deploy_exit
	set +e
	deploy_output=$(
		DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
			TOKEN_ADDRESS="$ANVIL_TOKEN_ADDRESS" \
			ADMIN_ADDRESS="$ANVIL_ADMIN_ADDRESS" \
			ORACLE_ADDRESS="$ANVIL_ORACLE_ADDRESS" \
			BURN_ADDRESS="$ANVIL_BURN_ADDRESS" \
			forge script script/Vault.s.sol:DeployVault \
			--rpc-url "$ANVIL_RPC_URL" \
			--broadcast \
			2>&1
	)
	deploy_exit=$?
	set -e

	if [[ $deploy_exit -ne 0 ]]; then
		log_error "Forge script failed (exit code ${deploy_exit}):"
		echo "$deploy_output"
		exit 1
	fi

	# Extract proxy address (second "Contract Address:" line, or look for "Proxy deployed at:")
	local proxy_address
	proxy_address=$(echo "$deploy_output" | grep -oP 'Proxy deployed at: \K0x[0-9a-fA-F]+' || true)

	if [[ -z $proxy_address ]]; then
		# Fallback: try extracting from forge script output
		proxy_address=$(echo "$deploy_output" | grep -oP 'Contract Address: \K0x[0-9a-fA-F]+' | tail -1 || true)
	fi

	if [[ -z $proxy_address ]]; then
		log_error "Failed to extract proxy contract address."
		echo "$deploy_output"
		exit 1
	fi

	# Auto-update tresr.yaml with the new proxy address (anvil section only)
	cd ..
	yaml_set "vault_contract" "$proxy_address"
	log_info "Updated ${CYAN}${CONFIG_FILE}${NC} → anvil.vault_contract: ${GREEN}${proxy_address}${NC}"

	# Banner
	cat <<-EOF

		${CYAN}==============================================================================${NC}
		${GREEN}   TresrVault (UUPS Proxy) deployed successfully!${NC}
		${CYAN}==============================================================================${NC}

		  Proxy:      ${GREEN}${proxy_address}${NC}  ← auto-updated in tresr.yaml
		  Token:      ${ANVIL_TOKEN_ADDRESS}
		  Admin:      ${ANVIL_ADMIN_ADDRESS}
		  Oracle:     ${ANVIL_ORACLE_ADDRESS}
		  Burn:       ${ANVIL_BURN_ADDRESS}

		${CYAN}==============================================================================${NC}

	EOF

	log_info "Done!"

	# Regenerate frontend config
	regen_client_config
}

# =============================================================================
# Deploy Token — Deploy mock RonToken + TresrFaucet to Anvil
# =============================================================================

function run_deploy_token() {
	assert_anvil_running

	log_info "Building and deploying RonToken + TresrFaucet to Anvil..."

	cd contracts
	export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

	# Build first to catch compile errors
	forge build --force || {
		log_error "Forge build failed!"
		exit 1
	}

	# Deploy via script
	local deploy_output
	local deploy_exit
	set +e
	deploy_output=$(
		DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
			FAUCET_FUND_AMOUNT="100000000000000000000000" \
			forge script script/DeployTestToken.s.sol:DeployTestToken \
			--rpc-url "$ANVIL_RPC_URL" \
			--broadcast \
			2>&1
	)
	deploy_exit=$?
	set -e

	if [[ $deploy_exit -ne 0 ]]; then
		log_error "Forge script failed (exit code ${deploy_exit}):"
		echo "$deploy_output"
		exit 1
	fi

	# Extract addresses
	local token_address
	token_address=$(echo "$deploy_output" | grep -oP 'RonToken deployed at: \K0x[0-9a-fA-F]+' || true)
	local faucet_address
	faucet_address=$(echo "$deploy_output" | grep -oP 'TresrFaucet deployed at: \K0x[0-9a-fA-F]+' || true)

	if [[ -z $token_address || -z $faucet_address ]]; then
		log_error "Failed to extract deployed contract addresses."
		echo "$deploy_output"
		exit 1
	fi

	# Auto-update tresr.yaml with deployed addresses (anvil section only)
	cd ..
	yaml_set "tresr_token_contract" "$token_address"
	yaml_set "token_ticker" "tRON"
	yaml_set "faucet_contract" "$faucet_address"
	log_info "Updated ${CYAN}${CONFIG_FILE}${NC}:"
	log_info "  anvil.tresr_token_contract: ${GREEN}${token_address}${NC}"
	log_info "  anvil.token_ticker:         ${GREEN}tRON${NC}"
	log_info "  anvil.faucet_contract:      ${GREEN}${faucet_address}${NC}"

	# Banner
	cat <<-EOF

		${CYAN}==============================================================================${NC}
		${GREEN}   RonToken + TresrFaucet deployed successfully!${NC}
		${CYAN}==============================================================================${NC}

		  Token:      ${GREEN}${token_address}${NC}  ← auto-updated in tresr.yaml
		  Ticker:     ${GREEN}tRON${NC}               ← auto-updated in tresr.yaml
		  Faucet:     ${GREEN}${faucet_address}${NC}  ← auto-updated in tresr.yaml

		${CYAN}==============================================================================${NC}

	EOF

	log_info "Done!"

	# Regenerate frontend config
	regen_client_config
}

# =============================================================================
# Stop — Kill any running Anvil on the configured port
# =============================================================================

function run_stop() {
	local pid
	pid=$(lsof -t -i ":${ANVIL_PORT}" -sTCP:LISTEN 2>/dev/null || true)

	if [[ -z $pid ]]; then
		log_info "No Anvil process found on port ${ANVIL_PORT}."
		return 0
	fi

	log_info "Stopping Anvil (PID ${pid}) on port ${ANVIL_PORT}..."
	kill "$pid" 2>/dev/null || true
	sleep 1

	if kill -0 "$pid" 2>/dev/null; then
		log_warn "Process still alive, sending SIGKILL..."
		kill -9 "$pid" 2>/dev/null || true
	fi

	log_info "Anvil stopped."
}

# =============================================================================
# Balance — Show balances for player, admin, and vault
# =============================================================================

function query_token_balance() {
	local address="$1"
	local raw
	raw=$(
		cast call \
			"$ANVIL_TOKEN_ADDRESS" \
			"balanceOf(address)(uint256)" \
			"$address" \
			--rpc-url "$ANVIL_RPC_URL" 2>/dev/null
	)
	raw=$(echo "$raw" | awk '{print $1}')
	local human
	human=$(cast from-wei "$raw" 2>/dev/null || echo "0")
	printf "%'.2f" "$human"
}

function query_avax_balance() {
	local address="$1"
	local raw
	raw=$(
		cast balance \
			"$address" \
			--rpc-url "$ANVIL_RPC_URL" 2>/dev/null
	)
	local human
	human=$(cast from-wei "$raw" 2>/dev/null || echo "0")
	printf "%'.2f" "$human"
}

function run_balance() {
	local wallet="$PLAYER_WALLET"

	# Parse balance sub-options
	shift || true
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--wallet)
			wallet="${2:?'--wallet requires an address'}"
			shift 2
			;;
		*)
			log_error "Unknown balance option: $1"
			show_help
			exit 1
			;;
		esac
	done

	assert_anvil_running

	# Read vault address from config
	local vault_address
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.vault_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
	local vault_label="not deployed"
	if [[ -n $vault_address && $vault_address != "$ZERO_ADDRESS" ]]; then
		vault_label=$(query_token_balance "$vault_address")
	fi

	# Read faucet address
	local faucet_address
	faucet_address=$(yq -r '.client.blockchain.avalanche.anvil.faucet_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
	local faucet_label="not deployed"
	if [[ -n $faucet_address && $faucet_address != "$ZERO_ADDRESS" ]]; then
		faucet_label=$(query_token_balance "$faucet_address")
	fi

	# Query all balances
	local player_tresr player_avax admin_avax
	player_tresr=$(query_token_balance "$wallet")
	player_avax=$(query_avax_balance "$wallet")
	admin_avax=$(query_avax_balance "$ANVIL_ADMIN_ADDRESS")

	# Display
	cat <<-EOF

		${CYAN}==============================================================================${NC}
		${CYAN}   Balances (Anvil, chain ${ANVIL_CHAIN_ID})${NC}
		${CYAN}==============================================================================${NC}

		  ${YELLOW}Player${NC}     ${wallet}
		    ${TOKEN_TICKER}:  ${GREEN}${player_tresr}${NC}
		    AVAX:    ${GREEN}${player_avax}${NC}

		  ${YELLOW}Admin${NC}      ${ANVIL_ADMIN_ADDRESS}
		    AVAX:    ${GREEN}${admin_avax}${NC}

		  ${YELLOW}Vault${NC}      ${vault_address:-$ZERO_ADDRESS}
		    ${TOKEN_TICKER}:  ${GREEN}${vault_label}${NC}

		  ${YELLOW}Faucet${NC}     ${faucet_address:-$ZERO_ADDRESS}
		    ${TOKEN_TICKER}:  ${GREEN}${faucet_label}${NC}

		${CYAN}==============================================================================${NC}

	EOF
}

# =============================================================================
# Health Check
# =============================================================================

function run_health() {
	log_info "Running Anvil health checks..."
	assert_anvil_running

	local pass=0
	local fail=0

	# ─── 1. RPC connectivity ────────────────────────────────────────────
	log_info "[1/6] Testing RPC connectivity..."
	if cast client --rpc-url "$ANVIL_RPC_URL" >/dev/null 2>&1; then
		log_info "  ${GREEN}✓${NC} RPC is reachable at ${ANVIL_RPC_URL}"
		((pass++)) || true
	else
		log_error "  ✗ RPC is NOT reachable at ${ANVIL_RPC_URL}"
		((fail++)) || true
	fi

	# ─── 2. Chain ID ────────────────────────────────────────────────────
	log_info "[2/6] Verifying chain ID..."
	local chain_id
	chain_id=$(cast chain-id --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "0")
	if [[ $chain_id == "$ANVIL_CHAIN_ID" ]]; then
		log_info "  ${GREEN}✓${NC} Chain ID: ${chain_id} (expected ${ANVIL_CHAIN_ID})"
		((pass++)) || true
	else
		log_error "  ✗ Chain ID: ${chain_id} (expected ${ANVIL_CHAIN_ID})"
		((fail++)) || true
	fi

	# ─── 3. Block number advancing ─────────────────────────────────────
	log_info "[3/6] Checking current block number..."
	local block_number
	block_number=$(cast block-number --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "0")
	if [[ $block_number -gt 0 ]]; then
		log_info "  ${GREEN}✓${NC} Current block: ${block_number}"
		((pass++)) || true
	else
		log_warn "  ⚠ Block number is 0 — no transactions mined yet"
		((pass++)) || true
	fi

	# ─── 4. Test tx: self-transfer + receipt confirmation ──────────────
	log_info "[4/6] Sending test transaction (self-transfer 0 ETH)..."
	local tx_hash
	tx_hash=$(
		cast send \
			"$ANVIL_ADMIN_ADDRESS" \
			--value 0 \
			--private-key "$DEPLOYER_PRIVATE_KEY" \
			--rpc-url "$ANVIL_RPC_URL" \
			--json 2>/dev/null | jq -r '.transactionHash'
	)

	if [[ -z $tx_hash || $tx_hash == "null" ]]; then
		log_error "  ✗ Failed to send test transaction"
		((fail++)) || true
	else
		# Confirm receipt
		local receipt_status
		receipt_status=$(
			cast receipt \
				"$tx_hash" \
				--rpc-url "$ANVIL_RPC_URL" \
				--json 2>/dev/null | jq -r '.status'
		)
		if [[ $receipt_status == "0x1" ]]; then
			log_info "  ${GREEN}✓${NC} Tx sent and receipt confirmed: ${tx_hash:0:18}..."
			((pass++)) || true
		else
			log_error "  ✗ Tx sent but receipt status: ${receipt_status:-missing}"
			((fail++)) || true
		fi
	fi

	# ─── 5. Deployed contracts callable (if deployed) ──────────────────
	log_info "[5/6] Testing deployed contracts..."
	local token_address
	token_address=$(yq -r '.client.blockchain.avalanche.anvil.tresr_token_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")

	if [[ -n $token_address && $token_address != "$ZERO_ADDRESS" ]]; then
		local token_name
		token_name=$(cast call "$token_address" "name()(string)" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
		if [[ -n $token_name ]]; then
			log_info "  ${GREEN}✓${NC} Token contract responds: ${token_name}"
			((pass++)) || true
		else
			log_error "  ✗ Token contract at ${token_address} is not responding"
			((fail++)) || true
		fi
	else
		log_info "  ${YELLOW}—${NC} Token not deployed (skipped)"
	fi

	# ─── 6. Vault ↔ Token cross-check ──────────────────────────────────
	log_info "[6/6] Verifying vault references correct token..."
	local vault_address
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.vault_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")

	if [[ -n $vault_address && $vault_address != "$ZERO_ADDRESS" && -n $token_address && $token_address != "$ZERO_ADDRESS" ]]; then
		local vault_token
		vault_token=$(cast call "$vault_address" "token()(address)" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
		# Normalize to lowercase for comparison
		local vault_token_lower token_lower
		vault_token_lower=$(echo "$vault_token" | tr '[:upper:]' '[:lower:]')
		token_lower=$(echo "$token_address" | tr '[:upper:]' '[:lower:]')
		if [[ $vault_token_lower == "$token_lower" ]]; then
			log_info "  ${GREEN}✓${NC} Vault's token() matches config: ${vault_token}"
			((pass++)) || true
		else
			log_error "  ✗ Vault's token() is ${vault_token} but config has ${token_address}"
			log_error "    Run: solidity-dev stop && solidity-dev start && solidity-dev loop"
			((fail++)) || true
		fi
	else
		log_info "  ${YELLOW}—${NC} Vault or token not deployed (skipped)"
	fi

	# ─── Summary ───────────────────────────────────────────────────────
	echo ""
	if [[ $fail -eq 0 ]]; then
		log_info "${GREEN}Health check passed: ${pass}/${pass} checks OK${NC}"
	else
		log_error "Health check: ${pass} passed, ${fail} failed"
		exit 1
	fi
}

# =============================================================================
# Main
# =============================================================================

# Load config for all commands except help and stop
case "${1:-}" in
help | -h | "") ;;
stop) ;;
*) load_config && verify_config ;;
esac

case "${1:-}" in
check)
	run_check
	;;
start)
	run_start "$@"
	;;
stop)
	run_stop
	;;
fund)
	run_fund "$@"
	;;
health)
	run_health
	;;
balance)
	run_balance "$@"
	;;
deploy-vault)
	run_deploy
	;;
deploy-token)
	run_deploy_token
	;;
loop)
	# One-shot: deploy-token → deploy-vault → fund → health
	assert_anvil_running
	run_deploy_token
	# Reload config after deploy-token updated tresr.yaml
	load_config && verify_config
	run_deploy
	# Reload config after deploy updated tresr.yaml
	load_config && verify_config
	run_fund "$@"
	run_health
	;;
help | -h | "")
	show_help
	;;
*)
	log_error "Unknown command: $1"
	show_help
	exit 1
	;;
esac
