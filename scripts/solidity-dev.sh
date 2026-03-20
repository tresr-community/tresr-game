#!/usr/bin/env bash

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

# Restore terminal — forge's progress spinner sets scroll regions and uses the
# alternate screen buffer. If the script exits mid-spinner, the scroll region
# stays restricted (prompt at top, output stuck below). Reset everything.
function restore_terminal() {
	printf '\e[?1049l' 2>/dev/null || true # leave alternate screen buffer
	printf '\e[r' 2>/dev/null || true      # reset scroll region to full terminal
	printf '\e[999;1H' 2>/dev/null || true # move cursor to bottom-left
}
trap restore_terminal EXIT

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

# Set to 'true' by `loop --force` to bypass the existence check and redeploy
FORCE_DEPLOY="false"

# Set to 'true' when running via `loop` — enables the existence-check guard.
# deploy-token and deploy-vault as direct subcommands always deploy.
LOOP_MODE="false"

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
	echo "  check                          Run all Solidity checks (fmt, build, slither, test)"
	echo "  build                          Clean and build all Solidity contracts"
	echo "  update                         Update Foundry dependencies (forge-std, OpenZeppelin)"
	echo "  start   [--wallet ADDR]        Start standalone Anvil (chain 31337), fund wallet, tail logs"
	echo "  stop                           Stop any running Anvil instance"
	echo "  loop    [--wallet ADDR]        One-shot CI: deploy → fund → health (skips if already deployed)"
	echo "  loop --force [--wallet ADDR]   Same as loop but forces redeployment of all contracts"
	echo "  fund    [--wallet ADDR]        Mint tokens to vault + wallet (Anvil must be running)"
	echo "  health                         Smoke-test Anvil: RPC, chain ID, send tx, confirm receipt"
	echo "  balance [--wallet ADDR]        Show token + AVAX balance for an address"
	# shellcheck disable=SC2016
	echo '  burn     <address>             Burn all $tRON from an address to 0xdead (for faucet testing)'
	echo "  deploy-token                   Deploy RonToken + TresrFaucet to Anvil (run FIRST)"
	echo "  deploy-vault                   Deploy Vault contract to Anvil (run AFTER deploy-token)"
	echo "  help                           Show this help message"
	echo ""
	echo "Options:"
	echo "  --wallet  0x...   Player wallet for funding (default: from tresr.yaml)"
	echo "  --force           Force redeployment even if contracts are already deployed (loop only)"
}

# =============================================================================
# Solc — Ensure the Solidity compiler is available before building
# =============================================================================
# All dependencies are managed by devenv (Nix). The `languages.solidity` option
# provides `solc` on PATH. We tell forge to use it via FOUNDRY_SOLC so it never
# downloads its own copy to ~/.local/share/svm/ (those binaries get Nix-patched
# and break after garbage collection).
#
# If running outside devenv (unusual), fall back to clearing any stale svm
# binaries so forge can re-download.

function ensure_solc() {
	# If solc is on PATH (provided by devenv), tell forge to use it directly
	if command -v solc &>/dev/null; then
		local nix_solc
		nix_solc=$(command -v solc)
		export FOUNDRY_SOLC="$nix_solc"
		local nix_version
		nix_version=$(solc --version 2>/dev/null | grep -oP 'Version: \K[0-9.]+' || echo "unknown")
		log_info "Using devenv-provided solc ${GREEN}${nix_version}${NC} (${CYAN}${nix_solc}${NC})"
		return 0
	fi

	# Fallback: no solc on PATH — check if svm binary exists and works
	log_warn "solc not found on PATH (not in devenv shell?)"

	local project_root
	project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
	local foundry_toml="${project_root}/contracts/foundry.toml"

	if [[ ! -f $foundry_toml ]]; then
		return 0
	fi

	local solc_version
	solc_version=$(grep -oP "solc_version\s*=\s*'\K[^']+" "$foundry_toml" 2>/dev/null || true)
	if [[ -z $solc_version ]]; then
		return 0
	fi

	local solc_bin="${HOME}/.local/share/svm/${solc_version}/solc-${solc_version}"

	if [[ ! -f $solc_bin ]]; then
		log_info "solc ${solc_version} not cached — forge will download on first build."
		return 0
	fi

	# Test if the svm binary actually runs
	if "$solc_bin" --version &>/dev/null; then
		return 0
	fi

	# Broken binary (stale Nix glibc interpreter) — remove so forge re-downloads
	log_warn "svm solc ${solc_version} binary is broken (stale Nix interpreter)."
	log_info "Removing ${CYAN}${solc_bin}${NC} so forge re-downloads..."
	rm -f "$solc_bin"
}
# =============================================================================
# Update — Pin Foundry submodules to latest stable release tags
# =============================================================================
# NOTE: `forge update` does not work in a monorepo where `contracts/` is a
#       subdirectory because `.gitmodules` lives at the repo root with paths like
#       `contracts/lib/...`. Forge expects `.gitmodules` in its own root.
#
# This function fetches all tags for each submodule, finds the latest stable
# release (filtering out pre-releases like rc/alpha/beta), and checks out that
# tag. This is the correct approach — never use `git submodule update --remote`
# which tracks HEAD of the default branch.

# Resolve the latest stable release tag for a submodule.
# Args: $1 = absolute path to the submodule
#       $2 = tag prefix filter (e.g. "v" for "v5.6.1", "v1" for "v1.15.0")
# Outputs the tag name to stdout.
function latest_stable_tag() {
	local sub_path="$1"
	local prefix="${2:-v}"

	git -C "$sub_path" fetch --tags 2>&1

	# List tags matching prefix, exclude pre-releases, sort by semver
	local tag
	tag=$(
		git -C "$sub_path" tag -l "${prefix}*" |
			grep -vE '[-](rc|alpha|beta|dev|pre)' |
			sort -V |
			tail -1
	)

	if [[ -z $tag ]]; then
		return 1
	fi

	echo "$tag"
}

function run_update() {
	log_info "Updating Foundry dependencies to latest stable releases..."

	local project_root
	project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

	# Submodule paths (relative to repo root) and their tag prefix filters
	# Format: "path|tag_prefix"
	local deps=(
		"contracts/lib/forge-std|v"
		"contracts/lib/openzeppelin-contracts|v5."
		"contracts/lib/openzeppelin-contracts-upgradeable|v5."
	)

	local updated=0

	for entry in "${deps[@]}"; do
		local dep="${entry%%|*}"
		local prefix="${entry##*|}"
		local name
		name=$(basename "$dep")
		local abs_path="${project_root}/${dep}"

		if [[ ! -d $abs_path ]]; then
			log_warn "${name} not found at ${dep} — skipping"
			continue
		fi

		log_info "Checking ${CYAN}${name}${NC}..."

		# Resolve current tag
		local current
		current=$(git -C "$abs_path" describe --tags --exact-match 2>/dev/null || echo "unknown")

		# Resolve latest stable tag
		local latest
		if ! latest=$(latest_stable_tag "$abs_path" "$prefix"); then
			log_warn "No stable tags found for ${name} with prefix '${prefix}'"
			continue
		fi

		if [[ $current == "$latest" ]]; then
			log_info "  ${GREEN}✓${NC} ${name} already at ${GREEN}${latest}${NC}"
			continue
		fi

		log_info "  ${YELLOW}${current}${NC} → ${GREEN}${latest}${NC}"

		# Checkout the tag
		git -C "$abs_path" checkout "$latest" || {
			log_error "Failed to checkout ${latest} for ${name}"
			exit 1
		}

		# Handle nested submodules (e.g. OZ upgradeable references OZ contracts)
		if [[ -f "${abs_path}/.gitmodules" ]]; then
			log_info "  Syncing nested submodules for ${CYAN}${name}${NC}..."
			git -C "$abs_path" submodule update --init --recursive --progress
		fi

		# Stage the updated submodule pointer
		git -C "$project_root" add "$dep"
		((updated++))
	done

	if ((updated == 0)); then
		log_info "${GREEN}All dependencies are already up to date!${NC}"
		return 0
	fi

	# Clean any dirty content inside submodules (build artifacts, etc.)
	log_info "Cleaning submodule working trees..."
	git -C "$project_root" submodule foreach --recursive \
		git clean -fdx || true

	# Verify the build still works with updated deps
	ensure_solc
	log_info "Running ${CYAN}forge clean${NC}..."
	cd "${project_root}/contracts"
	rm -f foundry.lock
	forge clean
	log_info "Running ${CYAN}forge build${NC} to verify updated dependencies..."
	forge build || {
		log_error "Forge build failed after update!"
		log_error "Unstage with: ${CYAN}git checkout contracts/lib${NC}"
		exit 1
	}
	cd "$project_root"

	log_info "${GREEN}${updated} dependency(ies) updated successfully!${NC}"
	log_info "Review changes: ${CYAN}git diff --cached contracts/lib${NC}"
	log_info "Commit: ${CYAN}git commit -m 'chore(contracts): update foundry deps'${NC}"
}

# =============================================================================
# Build
# =============================================================================

function run_build() {
	ensure_solc
	log_info "Building Solidity contracts..."
	cd contracts
	export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

	forge clean
	forge build \
		--names \
		--sizes \
		--force ||
		{
			log_error "Forge build has failed!"
			exit 1
		}
	log_info "${GREEN}Build successful!${NC}"
	cd ..
}

# =============================================================================
# Check
# =============================================================================

function run_check() {
	ensure_solc
	log_info "Running Solidity checks..."
	cd contracts
	export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

	# Format check
	forge fmt || {
		log_error "Forge format validation has failed!"
		exit 1
	}

	# Build first — forge auto-downloads solc via svm, which slither needs
	forge build \
		--build-info \
		--names \
		--sizes \
		--force ||
		{
			log_error "Forge build validation has failed!"
			exit 1
		}

	# Static analysis (requires build artifacts to exist)
	slither . || {
		log_error "Slither validation has failed!"
		exit 1
	}

	# Tests
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
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.proxy_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
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

	# Calculate splits: 1,000 to wallet, rest to vault
	local wallet_cap="1000000000000000000000" # 1,000e18
	local vault_amount="0"
	local wallet_amount="$fund_amount"
	if [[ $vault_deployed == true ]]; then
		wallet_amount="$wallet_cap"
		vault_amount=$(echo "$fund_amount - $wallet_amount" | bc)
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
		cast erc20-token mint \
			"$ANVIL_TOKEN_ADDRESS" \
			"$vault_address" \
			"$vault_amount" \
			--private-key "$DEPLOYER_PRIVATE_KEY" \
			--rpc-url "$ANVIL_RPC_URL" \
			--quiet >/dev/null
	fi

	# Mint to wallet
	log_info "Minting → wallet (${wallet_amount} wei)..."
	cast erc20-token mint \
		"$ANVIL_TOKEN_ADDRESS" \
		"$wallet_address" \
		"$wallet_amount" \
		--private-key "$DEPLOYER_PRIVATE_KEY" \
		--rpc-url "$ANVIL_RPC_URL" \
		--quiet >/dev/null

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
	if cast block-number --rpc-url "$ANVIL_RPC_URL" >/dev/null 2>&1; then
		log_error "Port ${ANVIL_PORT} is already in use (Anvil already running?). Run 'stop' first."
		exit 1
	fi

	# Trap signals for cleanup
	trap cleanup_anvil EXIT INT TERM

	# Start standalone Anvil (no fork)
	log_info "Starting Anvil on port ${ANVIL_PORT} (chain ${ANVIL_CHAIN_ID})..."

	# Build state-file flags — load existing state when present so contract
	# addresses survive restarts without requiring a full redeploy.
	local state_flags=()
	if [[ -f .anvil-state.json ]]; then
		log_info "Restoring Anvil state from ${CYAN}.anvil-state.json${NC}..."
		state_flags+=(--load-state .anvil-state.json)
	fi
	state_flags+=(--dump-state .anvil-state.json --state-interval 1)

	# Bind on all interfaces so the Juno SkyLab Docker container can reach Anvil
	# via host.docker.internal (injected by --add-host in juno.config.mjs extraHosts).
	anvil --host 0.0.0.0 --port "$ANVIL_PORT" --chain-id "$ANVIL_CHAIN_ID" "${state_flags[@]}" &
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
# Burn — Send all $tRON from an address to 0xdead (for faucet testing)
# =============================================================================

function run_burn() {
	local wallet="$PLAYER_WALLET"

	# Parse burn sub-options
	shift || true
	while [[ $# -gt 0 ]]; do
		case "$1" in
		--wallet)
			wallet="${2:?'--wallet requires an address'}"
			shift 2
			;;
		*)
			log_error "Unknown burn option: $1"
			show_help
			exit 1
			;;
		esac
	done

	assert_anvil_running

	# Query current balance
	local raw_balance
	raw_balance=$(cast call \
		"$ANVIL_TOKEN_ADDRESS" \
		"balanceOf(address)(uint256)" \
		"$wallet" \
		--rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "0")

	if [[ $raw_balance == "0" || -z $raw_balance ]]; then
		log_info "Wallet ${CYAN}${wallet}${NC} has no $TOKEN_TICKER to burn."
		return 0
	fi

	local human_balance
	human_balance=$(cast from-wei "$raw_balance" 2>/dev/null || echo "$raw_balance")
	human_balance=$(printf "%'.2f" "$human_balance")

	log_info "Burning ${RED}${human_balance}${NC} $TOKEN_TICKER from ${CYAN}${wallet}${NC} → ${RED}${ANVIL_BURN_ADDRESS}${NC}"

	# Impersonate the wallet on Anvil (no private key needed)
	cast rpc anvil_impersonateAccount "$wallet" --rpc-url "$ANVIL_RPC_URL" >/dev/null

	# Transfer all tokens to burn address
	cast send \
		"$ANVIL_TOKEN_ADDRESS" \
		"transfer(address,uint256)(bool)" \
		"$ANVIL_BURN_ADDRESS" \
		"$raw_balance" \
		--from "$wallet" \
		--rpc-url "$ANVIL_RPC_URL" \
		--unlocked \
		>/dev/null

	# Stop impersonating
	cast rpc anvil_stopImpersonatingAccount "$wallet" --rpc-url "$ANVIL_RPC_URL" >/dev/null

	log_info "${GREEN}Done!${NC} Burned ${RED}${human_balance}${NC} $TOKEN_TICKER from ${CYAN}${wallet}${NC}"
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

function run_deploy_vault() {
	# Oracle address for local dev (matches satellite's deterministic ECDSA eth address in Juno local dev)
	local ANVIL_ORACLE_ADDRESS="0x96E38aFd72Ca03c9794c0CCD2a8405FC47A9F926"

	# Dynamically fetch the oracle address from the local satellite if possible
	# Read satellite ID from config-server.json (source of truth: tresr.yaml)
	local config_json
	config_json="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config/config-server.json"
	local satellite_id=""
	if [[ -f $config_json ]]; then
		satellite_id=$(jq -r '.juno.development.satellite_id // ""' "$config_json" 2>/dev/null || true)
	fi

	if [[ -n $satellite_id ]]; then
		if ! command -v dfx &>/dev/null; then
			log_warn "dfx not found in PATH — cannot fetch oracle address dynamically. Using fallback: ${ANVIL_ORACLE_ADDRESS}"
		else
			log_info "Fetching oracle address from satellite ${CYAN}${satellite_id}${NC}..."
			local oracle_output=""
			local oracle_err=""
			oracle_err=$(mktemp)
			# Use Juno's Pocket IC port directly — no dfx.json needed
			oracle_output=$(dfx canister call "$satellite_id" get_oracle_address '()' --network http://localhost:5987 2>"$oracle_err") || true

			if [[ -z $oracle_output || $oracle_output == *"Error"* ]]; then
				local err_msg
				err_msg=$(cat "$oracle_err" 2>/dev/null || true)
				[[ -n $err_msg ]] && log_warn "dfx call failed: ${err_msg}"
			fi
			rm -f "$oracle_err"

			local extracted=""
			extracted=$(echo "$oracle_output" | grep -oP '0x[0-9a-fA-F]{40}' | head -1 || true)

			if [[ -n $extracted ]]; then
				ANVIL_ORACLE_ADDRESS="$extracted"
				log_info "Dynamic oracle address: ${GREEN}${ANVIL_ORACLE_ADDRESS}${NC}"
			else
				log_warn "Failed to fetch oracle address from satellite. Using fallback: ${ANVIL_ORACLE_ADDRESS}"
			fi
		fi
	else
		log_warn "Satellite ID not found in config-server.json. Using fallback oracle address: ${ANVIL_ORACLE_ADDRESS}"
	fi

	assert_anvil_running

	log_info "Building and deploying TresrVault (UUPS proxy) to Anvil..."

	cd contracts
	export FOUNDRY_DISABLE_NIGHTLY_WARNING=1
	local BROADCAST_FILE="broadcast/Vault.s.sol/${ANVIL_CHAIN_ID}/run-latest.json"

	# Build first to catch compile errors (also produces artifacts for bytecode check)
	forge build --force || {
		log_error "Forge build failed!"
		exit 1
	}

	# ── Deploy guard ──────────────────────────────────────────────────────────
	# Skip if already deployed (existence check). Pass --force to override.
	# To always redeploy: solidity-dev loop --force
	local vault_addr
	vault_addr=$(yq -r '.client.blockchain.avalanche.anvil.proxy_contract // ""' "../config/tresr.yaml" 2>/dev/null || echo "")
	local zero="0x0000000000000000000000000000000000000000"

	if [[ $LOOP_MODE == "true" && $FORCE_DEPLOY != "true" && -n $vault_addr && $vault_addr != "$zero" && $vault_addr != "null" ]]; then
		local on_chain_code
		on_chain_code=$(cast code "$vault_addr" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
		if [[ -n $on_chain_code && $on_chain_code != "0x" ]]; then
			log_info "${GREEN}✓${NC} Vault already deployed at ${CYAN}${vault_addr}${NC} — ${YELLOW}skipping redeploy${NC}"
			cd ..
			return 0
		fi
	fi
	[[ $FORCE_DEPLOY == "true" ]] && log_info "${YELLOW}[--force]${NC} Redeploying Vault..."
	# ── End deploy guard ───────────────────────────────────────────────────────

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
	yaml_set "proxy_contract" "$proxy_address"
	log_info "Updated ${CYAN}${CONFIG_FILE}${NC} → anvil.proxy_contract: ${GREEN}${proxy_address}${NC}"

	# Also update vault_contract (implementation address) from broadcast
	local impl_address
	impl_address=$(jq -r '.transactions[] | select(.transactionType == "CREATE" and .contractName == "Vault") | .contractAddress' "$BROADCAST_FILE" 2>/dev/null || echo "")
	if [[ -n $impl_address ]]; then
		yaml_set "vault_contract" "$impl_address"
		log_info "Updated ${CYAN}${CONFIG_FILE}${NC} → anvil.vault_contract: ${GREEN}${impl_address}${NC}"
	fi

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

	# Build first to catch compile errors (also produces artifacts for bytecode check)
	forge build --force || {
		log_error "Forge build failed!"
		exit 1
	}

	# ── Deploy guard ──────────────────────────────────────────────────────────
	# Skip if already deployed (existence check). Pass --force to override.
	# To always redeploy: solidity-dev loop --force
	local token_addr
	token_addr=$(yq -r '.client.blockchain.avalanche.anvil.tresr_token_contract // ""' "../config/tresr.yaml" 2>/dev/null || echo "")
	local faucet_addr
	faucet_addr=$(yq -r '.client.blockchain.avalanche.anvil.faucet_contract // ""' "../config/tresr.yaml" 2>/dev/null || echo "")
	local zero="0x0000000000000000000000000000000000000000"

	if [[ $LOOP_MODE == "true" && $FORCE_DEPLOY != "true" && -n $token_addr && $token_addr != "$zero" && $token_addr != "null" ]]; then
		local on_chain_token
		on_chain_token=$(cast code "$token_addr" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
		local on_chain_faucet=""
		if [[ -n $faucet_addr && $faucet_addr != "$zero" && $faucet_addr != "null" ]]; then
			on_chain_faucet=$(cast code "$faucet_addr" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
		fi
		if [[ -n $on_chain_token && $on_chain_token != "0x" && -n $on_chain_faucet && $on_chain_faucet != "0x" ]]; then
			log_info "${GREEN}✓${NC} Token + Faucet already deployed — ${YELLOW}skipping redeploy${NC}"
			log_info "  Token:  ${CYAN}${token_addr}${NC}"
			log_info "  Faucet: ${CYAN}${faucet_addr}${NC}"
			cd ..
			return 0
		fi
	fi
	[[ $FORCE_DEPLOY == "true" ]] && log_info "${YELLOW}[--force]${NC} Redeploying Token + Faucet..."
	# ── End deploy guard ───────────────────────────────────────────────────────

	# Deploy via script
	local deploy_output
	local deploy_exit
	set +e
	deploy_output=$(
		DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" \
			FAUCET_FUND_AMOUNT="100000000000000000000000" \
			forge script script/DeployToken.s.sol:DeployTestToken \
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
	# Try lsof first, fall back to ss then fuser (lsof may not see processes
	# spawned inside nix/devenv shells on some Linux kernels)
	pid=$(lsof -t -i ":${ANVIL_PORT}" -sTCP:LISTEN 2>/dev/null || true)
	if [[ -z $pid ]]; then
		pid=$(ss -tlnp 2>/dev/null | grep ":${ANVIL_PORT}" | grep -oP 'pid=\K[0-9]+' | head -1 || true)
	fi
	if [[ -z $pid ]]; then
		pid=$(fuser "${ANVIL_PORT}/tcp" 2>/dev/null | awk '{print $1}' || true)
	fi

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
	raw=$(cast erc20-token balance \
		"$ANVIL_TOKEN_ADDRESS" \
		"$address" \
		--rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "0")
	local wei
	wei=$(echo "$raw" | awk '{print $1}')
	local human
	human=$(cast from-wei "$wei" 2>/dev/null || echo "0")
	printf "%'.2f" "$human"
}

function query_avax_balance() {
	local address="$1"
	local human
	human=$(cast balance "$address" --ether --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "0")
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
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.proxy_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")
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
		receipt_status=$(cast receipt "$tx_hash" status --rpc-url "$ANVIL_RPC_URL" 2>/dev/null | awk '{print $1}')
		if [[ $receipt_status == "1" || $receipt_status == "0x1" || $receipt_status == "true" ]]; then
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
		token_name=$(cast erc20-token name "$token_address" --rpc-url "$ANVIL_RPC_URL" 2>/dev/null || echo "")
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
	vault_address=$(yq -r '.client.blockchain.avalanche.anvil.proxy_contract // ""' "$CONFIG_FILE" 2>/dev/null || echo "")

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
build)
	run_build
	;;
update)
	run_update
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
	run_deploy_vault
	;;
deploy-token)
	run_deploy_token
	;;
burn)
	run_burn "$@"
	;;
loop)
	# Parse flags before dispatching
	shift # consume 'loop'
	while [[ $# -gt 0 ]]; do
		case "${1:-}" in
		--force)
			FORCE_DEPLOY="true"
			shift
			;;
		--wallet)
			shift
			PLAYER_WALLET="${1:-}"
			shift
			;;
		*) shift ;;
		esac
	done
	[[ $FORCE_DEPLOY == "true" ]] && log_info "${YELLOW}⚠  Force mode enabled — all contracts will be redeployed${NC}"
	LOOP_MODE="true"
	# One-shot: deploy-token → deploy-vault → fund → health
	assert_anvil_running
	run_deploy_token
	# Reload config after deploy-token updated tresr.yaml
	load_config && verify_config
	run_deploy_vault
	# Reload config after deploy updated tresr.yaml
	load_config && verify_config
	run_fund
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
