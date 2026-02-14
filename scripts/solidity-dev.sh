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
# Constants — Network-dependent values are set in configure_network()
# =============================================================================

CONFIG_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config/tresr.yaml"

# Anvil
ANVIL_PORT="8545"
ANVIL_PID=""
ANVIL_RPC_URL="http://127.0.0.1:${ANVIL_PORT}"

# Addresses — loaded from config/tresr.yaml by load_config()
ANVIL_ADMIN_ADDRESS=""
ANVIL_TOKEN_ADDRESS=""
ANVIL_TOKEN_TREASURY=""
PLAYER_WALLET=""
TOKEN_TICKER=""

# Network defaults (overridden by configure_network)
NETWORK=""
CHAIN_ID=""
FORK_URL=""
ANVIL_EXTRA_ARGS=()

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
	ANVIL_TOKEN_TREASURY=$(yq -r '.client.blockchain.avalanche.anvil.tresr_token_treasury' "$CONFIG_FILE")
	PLAYER_WALLET=$(yq -r '.client.blockchain.avalanche.anvil.player_wallet' "$CONFIG_FILE")
	TOKEN_TICKER=$(yq -r '.client.blockchain.avalanche.anvil.tresr_token_ticker' "$CONFIG_FILE")

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
		[ANVIL_TOKEN_TREASURY]="$ANVIL_TOKEN_TREASURY"
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
# Network Configuration
# =============================================================================

function configure_network() {
	local network="${1:-fuji}"

	case "$network" in
	fuji)
		NETWORK="fuji"
		CHAIN_ID="43113"
		FORK_URL="https://api.avax-test.network/ext/bc/C/rpc"
		ANVIL_EXTRA_ARGS=("--fork-url" "$FORK_URL" "--chain-id" "$CHAIN_ID")
		;;
	local)
		NETWORK="local"
		CHAIN_ID="31337"
		FORK_URL=""
		ANVIL_EXTRA_ARGS=("--chain-id" "$CHAIN_ID")
		;;
	*)
		log_error "Unknown network: $network (expected 'fuji' or 'local')"
		exit 1
		;;
	esac

	log_info "Network: ${CYAN}${NETWORK}${NC} (chain ${CHAIN_ID})"
	if [[ -n $FORK_URL ]]; then
		log_info "Fork URL: ${FORK_URL}"
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
	echo "  --check                                Run all Solidity checks (fmt, slither, build, test)"
	echo "  --start [--network N] [--wallet ADDR]  Start Anvil, fund wallet, tail logs"
	echo "  --stop                                 Stop any running Anvil instance"
	echo "  --fund  [--wallet ADDR]                Fund a wallet with tTRESR (Anvil must be running)"
	echo "  --balance [--wallet ADDR]              Show tTRESR + AVAX balance for an address"
	echo "  --deploy                               Deploy Vault contract to Anvil and print address"
	echo "  --help                                 Show this help message"
	echo ""
	echo "Start options:"
	echo "  --network fuji|local   Fork Fuji testnet (default) or run standalone"
	echo "  --wallet  0x...        Player wallet for funding (default: from tresr.yaml)"
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

	if [[ $NETWORK == "local" ]]; then
		log_warn "Skipping treasury impersonation on local network (no fork state)."
		return 0
	fi

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

	# Check treasury balance
	log_info "Checking treasury balance..."
	local treasury_raw
	treasury_raw=$(
		cast call \
			"$ANVIL_TOKEN_ADDRESS" \
			"balanceOf(address)(uint256)" \
			"$ANVIL_TOKEN_TREASURY" \
			--rpc-url "$ANVIL_RPC_URL"
	)
	# Strip any foundry formatting like [1e22] suffix
	local treasury_balance
	treasury_balance=$(echo "$treasury_raw" | awk '{print $1}')
	local treasury_human
	treasury_human=$(cast from-wei "$treasury_balance" 2>/dev/null || echo "$treasury_balance")
	treasury_human=$(printf "%'.2f" "$treasury_human")
	log_info "Treasury balance: ${GREEN}${treasury_human}${NC} $TOKEN_TICKER"

	if [[ $treasury_balance == "0" ]]; then
		log_error "Treasury is empty, nothing to fund."
		return 1
	fi

	# Cap at ~0.9% of treasury (contract enforces strict < 1% bootup transfer limit)
	local pillage_amount
	pillage_amount=$(echo "$treasury_balance * 9 / 1000" | bc)
	local pillage_human
	pillage_human=$(cast from-wei "$pillage_amount" 2>/dev/null || echo "$pillage_amount")
	pillage_human=$(printf "%'.2f" "$pillage_human")
	log_info "Pillaging ~0.9%: ${GREEN}${pillage_human}${NC} $TOKEN_TICKER (under bootup transfer limit)"

	# Calculate splits from pillaged amount
	local vault_amount="0"
	local wallet_amount="$pillage_amount"
	if [[ $vault_deployed == true ]]; then
		# 50/50 split — vault gets half, wallet gets half
		vault_amount=$(echo "$pillage_amount / 2" | bc)
		wallet_amount=$(echo "$pillage_amount - $vault_amount" | bc)
		local vault_human wallet_human_split
		vault_human=$(cast from-wei "$vault_amount" 2>/dev/null || echo "$vault_amount")
		vault_human=$(printf "%'.2f" "$vault_human")
		wallet_human_split=$(cast from-wei "$wallet_amount" 2>/dev/null || echo "$wallet_amount")
		wallet_human_split=$(printf "%'.2f" "$wallet_human_split")
		log_info "Splitting: ${GREEN}${vault_human}${NC} → vault, ${GREEN}${wallet_human_split}${NC} → wallet"
	fi

	# Fund treasury with native AVAX for gas (it has 0 on the fork).
	# Treasury is a contract with no receive(), so use anvil_setBalance cheatcode.
	log_info "Setting treasury gas balance (1 AVAX)..."
	cast rpc anvil_setBalance \
		"$ANVIL_TOKEN_TREASURY" \
		"0xDE0B6B3A7640000" \
		--rpc-url "$ANVIL_RPC_URL" >/dev/null

	# Impersonate the Treasury
	log_info "Impersonating treasury..."
	cast rpc \
		anvil_impersonateAccount "$ANVIL_TOKEN_TREASURY" \
		--rpc-url "$ANVIL_RPC_URL" >/dev/null

	# Send directly from treasury to destinations (avoids admin hop which
	# would trigger the bootup 1% transfer limit a second time).

	# Fund vault (if deployed)
	if [[ $vault_deployed == true && $vault_amount != "0" ]]; then
		log_info "Treasury → vault (${vault_amount} wei)..."
		cast send \
			"$ANVIL_TOKEN_ADDRESS" \
			"transfer(address,uint256)" \
			"$vault_address" \
			"$vault_amount" \
			--from "$ANVIL_TOKEN_TREASURY" \
			--rpc-url "$ANVIL_RPC_URL" \
			--unlocked >/dev/null
	fi

	# Fund wallet
	log_info "Treasury → wallet (${wallet_amount} wei)..."
	cast send \
		"$ANVIL_TOKEN_ADDRESS" \
		"transfer(address,uint256)" \
		"$wallet_address" \
		"$wallet_amount" \
		--from "$ANVIL_TOKEN_TREASURY" \
		--rpc-url "$ANVIL_RPC_URL" \
		--unlocked >/dev/null

	# Stop impersonating the Treasury
	cast rpc \
		anvil_stopImpersonatingAccount "$ANVIL_TOKEN_TREASURY" \
		--rpc-url "$ANVIL_RPC_URL" >/dev/null

	# Summary
	log_info "${GREEN}Funding complete!${NC}"
}

function run_start() {
	local network="fuji"
	local wallet="$PLAYER_WALLET"

	# Parse start sub-options
	shift || true
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--network)
			network="${2:?'--network requires a value (fuji|local)'}"
			shift 2
			;;
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

	configure_network "$network"

	# Ensure no existing anvil on this port
	if lsof -i ":${ANVIL_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
		log_error "Port ${ANVIL_PORT} is already in use. Run --stop first."
		exit 1
	fi

	# Trap signals for cleanup
	trap cleanup_anvil EXIT INT TERM

	# Start Anvil in background
	log_info "Starting Anvil on port ${ANVIL_PORT}..."
	anvil --port "$ANVIL_PORT" "${ANVIL_EXTRA_ARGS[@]}" &
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
		${CYAN}   Anvil is running (${NETWORK})${NC}
		${CYAN}==============================================================================${NC}

		  RPC URL:    ${GREEN}${ANVIL_RPC_URL}${NC}
		  Chain ID:   ${GREEN}${CHAIN_ID}${NC}
		  Wallet:     ${GREEN}${wallet}${NC}

		  Press ${YELLOW}CTRL+C${NC} to stop Anvil.

		${CYAN}==============================================================================${NC}

	EOF

	# Tail Anvil stdout (wait blocks until the process exits)
	wait "$ANVIL_PID"
}

# =============================================================================
# Fund — Send more tTRESR to a wallet (Anvil must be running)
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

	# Detect network from chain ID
	local chain_id
	chain_id=$(cast chain-id --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
	case "$chain_id" in
	43113) configure_network "fuji" ;;
	31337) configure_network "local" ;;
	*)
		log_warn "Unknown chain ID: ${chain_id}, assuming fuji fork."
		configure_network "fuji"
		;;
	esac

	fund_wallet "$wallet"

	log_info "Done! Wallet ${CYAN}${wallet}${NC} has been funded."
}

# =============================================================================
# Deploy — Deploy Vault contract to Anvil
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
	sed -i "/anvil:/,/testnet:/ s|vault_contract: \"0x[0-9a-fA-F]*\"|vault_contract: \"${proxy_address}\"|" "$CONFIG_FILE"
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
# Balance — Show balances for player, admin, vault, and treasury
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

	# Detect network from chain ID
	local chain_id
	chain_id=$(cast chain-id --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
	case "$chain_id" in
	43113) configure_network "fuji" ;;
	31337) configure_network "local" ;;
	*)
		log_warn "Unknown chain ID: ${chain_id}, assuming fuji fork."
		configure_network "fuji"
		;;
	esac

	# Read vault address from config
	local vault_address
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.vault_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
	local vault_label="not deployed"
	if [[ -n $vault_address && $vault_address != "$ZERO_ADDRESS" ]]; then
		vault_label=$(query_token_balance "$vault_address")
	fi

	# Query all balances
	local player_tresr player_avax admin_avax treasury_tresr
	player_tresr=$(query_token_balance "$wallet")
	player_avax=$(query_avax_balance "$wallet")
	admin_avax=$(query_avax_balance "$ANVIL_ADMIN_ADDRESS")
	treasury_tresr=$(query_token_balance "$ANVIL_TOKEN_TREASURY")

	# Display
	cat <<-EOF

		${CYAN}==============================================================================${NC}
		${CYAN}   Balances (${NETWORK})${NC}
		${CYAN}==============================================================================${NC}

		  ${YELLOW}Player${NC}     ${wallet}
		    ${TOKEN_TICKER}:  ${GREEN}${player_tresr}${NC}
		    AVAX:    ${GREEN}${player_avax}${NC}

		  ${YELLOW}Admin${NC}      ${ANVIL_ADMIN_ADDRESS}
		    AVAX:    ${GREEN}${admin_avax}${NC}

		  ${YELLOW}Vault${NC}      ${vault_address:-$ZERO_ADDRESS}
		    ${TOKEN_TICKER}:  ${GREEN}${vault_label}${NC}

		  ${YELLOW}Treasury${NC}   ${ANVIL_TOKEN_TREASURY}
		    ${TOKEN_TICKER}:  ${GREEN}${treasury_tresr}${NC}

		${CYAN}==============================================================================${NC}

	EOF
}

# =============================================================================
# Main
# =============================================================================

# Load config for all commands except --help and --stop
case "${1:-}" in
--help | -h | "") ;;
--stop) ;;
*) load_config && verify_config ;;
esac

case "${1:-}" in
--check)
	run_check
	;;
--start)
	run_start "$@"
	;;
--stop)
	run_stop
	;;
--fund)
	run_fund "$@"
	;;
--balance)
	run_balance "$@"
	;;
--deploy)
	run_deploy
	;;
--help | -h | "")
	show_help
	;;
*)
	log_error "Unknown command: $1"
	show_help
	exit 1
	;;
esac
