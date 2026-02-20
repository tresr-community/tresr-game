#!/usr/bin/env bash

clear
set -euo pipefail

# =============================================================================
# Juno Dev Script
# =============================================================================

JUNO_DEV_DIR=".devenv/juno"
JUNO_LOG_DIR="$JUNO_DEV_DIR/logs"
GLOBAL_LOG_FILE="$JUNO_LOG_DIR/juno-dev.log"

# Colors (work inside heredoc)
NC=$'\033[0m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
GREEN=$'\033[0;32m'
MAGENTA=$'\033[0;35m'
RED=$'\033[0;31m'
YELLOW=$'\033[1;33m'

# Logging - colored to terminal, plain text to log file
function log_info() {
	echo -e "${GREEN}[INFO]${NC} $*"
	echo "[INFO] $*" >>"$GLOBAL_LOG_FILE"
}
function log_warn() {
	echo -e "${YELLOW}[WARN]${NC} $*"
	echo "[WARN] $*" >>"$GLOBAL_LOG_FILE"
}
function log_error() {
	echo -e "${RED}[ERROR]${NC} $*"
	echo "[ERROR] $*" >>"$GLOBAL_LOG_FILE"
}
function log_success() {
	echo -e "${GREEN}[SUCCESS]${NC} $*"
	echo "[SUCCESS] $*" >>"$GLOBAL_LOG_FILE"
}

mkdir -p "$JUNO_LOG_DIR"

# =============================================================================
# Build: Astro Build (Clean + Hooks + Static Dist)
# =============================================================================

function cmd_astro_build() {
	log_info "🚀 Clean Astro build..."
	rm -rf dist node_modules/.vite .astro # Vite/Astro caches
	bun install
	bun run prebuild # client-config (non-CI)
	bun run build    # astro build → NEW dist/_astro/sw-[HASH].js!
	log_success "✅ Build done. NEW SW: $(find dist/_astro -name 'sw*' -print -quit 2>/dev/null || echo 'None')"
}

# =============================================================================
# Build: Juno Serverless Functions (Rust → WASM)
# =============================================================================

function cmd_functions_build() {
	log_info "🔧 Building Juno serverless functions..."

	# Regenerate Cargo.lock so it matches current Cargo.toml (version bumps etc.)
	# Juno CLI builds with --locked, so the lockfile must be up-to-date.
	cargo generate-lockfile 2>/dev/null || log_warn "cargo generate-lockfile failed (continuing)"

	# Set network so build.rs bakes the correct contract addresses from tresr.yaml
	SATELLITE_NETWORK="${SATELLITE_NETWORK:-anvil}" juno functions build || {
		log_error "Functions build failed!"
		return 1
	}
	log_success "✅ Functions build done."
}

# =============================================================================
# Deploy: Build + Upgrade Juno Serverless Functions (Direct Deploy)
# =============================================================================

function cmd_functions_deploy() {
	local mode="${1:-development}"

	# Build Rust → WASM (version stays at 0.0.0 locally; CI sets real version via convco)
	cmd_functions_build || return 1

	# Upgrade (direct deploy, skips CDN — use 'publish' for CI/CD)
	log_info "📤 Upgrading Juno serverless functions (mode=$mode)..."
	juno functions upgrade --mode "$mode" || {
		log_error "Functions upgrade failed!"
		return 1
	}
	log_success "✅ Functions upgraded (mode=$mode)."
}

# =============================================================================
# Deploy: Build + Juno Hosting (Local/Prod)
# =============================================================================

function cmd_juno_deploy() {
	local mode="${1:-development}"
	local skip_build="${2:-false}"

	if [[ $skip_build != "true" ]]; then
		cmd_astro_build
	fi

	log_info "📤 Juno hosting deploy (mode=$mode)..."

	# Build deploy flags
	local -a deploy_flags=(--config --immediate --mode "$mode")

	# NOTE: PWA/SW update testing break when this is on.
	#       Use juno-dev clear-satellite instead.
	# Clear stale assets on dev deploys to prevent old hashed files accumulating
	#if [[ $mode == "development" ]]; then
	#	deploy_flags+=(--clear)
	#fi

	if ! juno hosting deploy "${deploy_flags[@]}"; then
		log_error "Deploy failed!"
		return 1
	fi
	local url
	url="http://${VITE_SATELLITE_ID}.localhost:5987/"
	log_success "Satellite live: $url"
	echo "$url" # For piping
}

# =============================================================================
# Local Emulator (Start, Stop, Login)
# =============================================================================

function cmd_juno_emu_start_wait() {
	log_info "Starting Juno Emulator..."
	juno emulator start --headless >"$JUNO_LOG_DIR/juno-setup.log" 2>&1 &
	# Non-local variable.
	JUNO_EMULATOR_PID=$!

	# Wait for the console to be ready
	local JUNO_CONSOLE_READY=false
	for ((ATTEMPT = 1; ATTEMPT <= 25; ATTEMPT++)); do
		log_info "Waiting for Juno Console to be ready... (Attempt $ATTEMPT/25)"
		if curl -s "http://localhost:5866/" &>/dev/null; then
			JUNO_CONSOLE_READY=true
			sleep 10 # extra delay for canister readiness
			log_info "Juno Console is ready!"
			break
		fi
		sleep 10
	done

	if [[ ${JUNO_CONSOLE_READY} == false ]]; then
		log_error "Juno Console failed to start. Check $JUNO_LOG_DIR/juno-setup.log"
		return 1
	fi
}

function cmd_juno_emu_start() {
	# Install deps first (emulator start doesn't need a full build)
	log_info "Installing dependencies..."
	bun install

	cmd_juno_emu_start_wait || {
		log_error "Failed to start emulator!"
		return 1
	}
	cmd_juno_emu_login || {
		log_error "Failed to login to emulator!"
		return 1
	}
	# Build + deploy (single build via cmd_juno_deploy with build enabled)
	cmd_juno_deploy development || {
		log_error "Failed to deploy to emulator!"
		return 1
	}
	log_success "Emu ready!"
}

function cmd_juno_emu_stop() {
	log_info "🛑 Stopping emu..."
	juno emulator stop || {
		log_error "Juno Emu stop failed! Review the logs."
		return 1
	}
}

# Login and permit the CLI permission to manage the emulator.
function cmd_juno_emu_login() {
	local "SETUP=${1:-false}"
	if [[ ${SETUP:-false} == "true" ]]; then
		log_info "Setting up emulator login..."
	else
		log_info "Logging into Juno emulator..."
	fi
	juno login --browser brave --mode development || {
		log_error "Failed to login to emulator!"
		return 1
	}
	log_success "Emulator logged in!"
}

# =============================================================================
# Utilities
# =============================================================================

function logs() {
	if command -v multitail &>/dev/null; then
		multitail \
			--retry-all \
			--follow-all \
			-ci blue \
			--label "[GLOBAL] " \
			-T "$GLOBAL_LOG_FILE" || {
			log_error "Multitail failed to start."
			return 1
		}
	else
		tail -F "$GLOBAL_LOG_FILE" "$JUNO_LOG_DIR"/* || true
	fi
}

function cmd_check_didc() {
	if ! command -v didc &>/dev/null; then
		log_error "didc not found. Install for Candid declarations."
		return 1
	fi
}

function cmd_generate_ts_declarations() {
	local candid_dir="$1"
	local functions_dir="$2"

	log_info "Generating TypeScript declarations..."
	mkdir -p "${candid_dir}" || {
		log_error "Failed to create directory for Candid declarations."
		return 1
	}

	if [[ -f "${functions_dir}/satellite.did" ]]; then
		local did_file="${functions_dir}/satellite.did"
		local js_file="${candid_dir}/satellite.did.js"
		local ts_file="${candid_dir}/satellite.did.d.ts"

		# Generate JavaScript IDL factory (runtime)
		log_info "Generating JavaScript IDL factory from satellite.did..."
		didc bind "${did_file}" -t js >"${js_file}" || {
			log_error "Failed to generate JavaScript IDL factory."
			return 1
		}

		# Generate TypeScript declarations (types)
		log_info "Generating TypeScript declarations from satellite.did..."
		didc bind "${did_file}" -t ts >"${ts_file}" || {
			log_error "Failed to generate TypeScript declarations."
			return 1
		}
	else
		log_warn "satellite.did not found. Skipping Candid generation."
	fi

	cat <<-EOF >"${candid_dir}/index.ts"
		// Auto-generated TypeScript declarations for Satellite Candid interfaces
		export * from './satellite.did';
	EOF
	log_success "TypeScript declarations generated."
}

function cmd_lint() {
	log_info "Linting..."
	bun run lint || {
		log_error "Linting failed. Review output for errors."
		return 1
	}
}

function cmd_typecheck() {
	log_info "Type checking (tsc --noEmit)..."
	bunx tsc --noEmit || {
		log_error "TypeScript type check failed. Fix type errors before deploying."
		return 1
	}
	log_success "Type check passed."
}

function cmd_cleanup() {
	log_info "Cleaning artifacts..."
	rm -rf dist .astro node_modules/.vite .cache || {
		log_warn "One or more artifacts could not be removed."
	}
}

# Perform all the build steps but don't deploy.
function cmd_rebuild() {
	log_info "Full rebuild (build + candid)..."
	cmd_astro_build || {
		log_error "Build failed."
		return 1
	}
	cmd_check_didc || {
		log_error "didc not found."
		return 1
	}
	cmd_generate_ts_declarations "src/declarations/satellite" "src/satellite" || {
		log_error "Candid generation failed."
		return 1
	}
}

# =============================================================================
# Top-up: Fund Wallets with Cycles (Development)
# =============================================================================
# NOTE: The Juno admin server's /ledger/transfer/ endpoint funds PRINCIPALS
# (user wallets), NOT canisters directly. To top up Satellites/canisters,
# use the Juno Console UI "Get Cycles" button at http://localhost:5866/

# Default amount: 10 TCycles (10_000_000_000_000)
TOPUP_AMOUNT="${TOPUP_AMOUNT:-10000000000000}"

# Ledger ID for transfers
LEDGER_ID="um5iw-rqaaa-aaaaq-qaaba-cai"

# Transfer cycles to a principal (wallet)
# Usage: transfer_cycles_to_wallet <principal_id> <name> [amount]
function transfer_cycles_to_wallet() {
	local principal_id="$1"
	local name="$2"
	local amount="${3:-$TOPUP_AMOUNT}"
	local admin_url="${JUNO_ADMIN_URL:-http://localhost:5999}"
	local endpoint="/ledger/transfer/?to=${principal_id}&ledgerId=${LEDGER_ID}&amount=${amount}"
	local full_url="${admin_url}${endpoint}"

	if [[ -z $principal_id ]]; then
		log_warn "Skipping $name: No principal ID provided."
		return 0
	fi

	log_info "Funding $name ($principal_id) with ${amount} cycles..."

	# Check if admin server is reachable first
	if ! curl -s --connect-timeout 5 "${admin_url}/" >/dev/null 2>&1; then
		log_error "  → Admin server not reachable at ${admin_url}"
		return 1
	fi

	# Make the transfer request with timeout and capture full response
	local response_file
	response_file=$(mktemp)
	local http_code
	http_code=$(curl -s --connect-timeout 10 --max-time 30 \
		-w "%{http_code}" \
		-o "$response_file" \
		"$full_url" 2>&1)
	local curl_exit=$?

	if [[ $curl_exit -ne 0 ]]; then
		log_error "  → Curl failed with exit code: $curl_exit"
		rm -f "$response_file"
		return 1
	fi

	local response_body
	response_body=$(cat "$response_file")
	rm -f "$response_file"

	if [[ $http_code == "200" ]]; then
		log_success "$name funded successfully."
		return 0
	else
		log_warn "Failed to fund $name. HTTP $http_code - $response_body"
		return 1
	fi
}

# Top-up a wallet (principal) with cycles
function cmd_topup_wallet() {
	local wallet_id="${1:-}"

	if [[ -z $wallet_id ]]; then
		log_error "Usage: $0 topup-wallet <wallet_id>"
		log_info ""
		log_info "To top up Satellites/canisters, use the Juno Console UI:"
		log_info "  1. Open http://localhost:5866/"
		log_info "  2. Sign in and go to your Satellite"
		log_info "  3. Click 'Get Cycles' in the wallet section"
		return 1
	fi

	log_info "🔋 Topping up wallet $wallet_id..."
	transfer_cycles_to_wallet "$wallet_id" "Wallet"
}

# Show instructions for topping up canisters
function cmd_topup() {
	log_info "🔋 To top up Satellites with cycles:"
	log_info ""
	log_info "  1. Open the Juno Console: http://localhost:5866/"
	log_info "  2. Sign in (create identity if needed)"
	log_info "  3. Go to your Satellite"
	log_info "  4. Click 'Get Cycles' in the wallet section"
	log_info ""
	log_info "To fund a user WALLET (principal), use:"
	log_info "  $0 topup-wallet <principal_id>"
}

# =============================================================================
# Setup: Initial Juno Emulator Setup (Funding, etc.)
# =============================================================================

function cmd_setup() {
	# Clear logs at the start of setup
	log_info "Clearing old logs..."
	rm -f "$JUNO_LOG_DIR"/*.log
	: >"$GLOBAL_LOG_FILE"

	# Define cleanup function for this specific command
	cleanup_setup() {
		echo ""
		log_info "Stopping Juno Emulator..."
		juno emulator stop >/dev/null 2>&1 || true
		cat <<-EOF

			${GREEN}==============================================================================${NC}
			${GREEN}   🪐 Setup Complete! 🪐   ${NC}
			${GREEN}==============================================================================${NC}

			${CYAN}Setup complete. Welcome back to Earth.${NC}

			${RED}Remember to reload your shell to use the new environment variables.${NC}
		EOF

		return 1
	}

	# Trap SIGINT to run cleanup
	trap cleanup_setup SIGINT

	cmd_cleanup || {
		log_error "Cleanup failed."
		return 1
	}

	cmd_juno_emu_start_wait || {
		log_error "Juno Emulator failed to start. Check $JUNO_LOG_DIR/juno-setup.log"
		return 1
	}

	# $1=true to run initial setup
	cmd_juno_emu_login true || {
		log_error "Failed to login to emulator!"
		return 1
	}

	# Note: Canister funding happens via the Console UI "Get Cycles" button
	# The admin API only funds wallets (principals), not canisters directly

	clear
	cat <<-EOF

		${CYAN}==============================================================================${NC}
		${CYAN}   🪐 JUNO EMULATOR SETUP 🪐   ${NC}
		${CYAN}==============================================================================${NC}

		The ${YELLOW}Juno Emulator${NC} is initializing... 🚀

		Once it's ready, you can access the ${BLUE}Mission Control (Console UI)$${NC} at:

		👉  http://localhost:5866/

		${GREEN}======================================${NC}
		${GREEN}     Mission Directives:${NC}
		${GREEN}======================================${NC}

		1. Navigate to the Console URL.
		2. Sign In (create a new identity if needed).
		3. ${YELLOW}Funding Required:${NC}

		    For funding, you can either click the 'Get Cycles' button in the Juno Console

		    👉 Or, paste your ${MAGENTA}Wallet ID${NC} from the Juno Profile below to fund it automatically!

		4. Launch your first ${MAGENTA}Satellite${NC} 🛰️.
		5. Secure the ${MAGENTA}Satellite ID${NC}.
		6. Update your local configuration (${YELLOW}.env${NC}):

		    ${CYAN}VITE_SATELLITE_ID=...${NC}

		${RED}======================================${NC}
		${RED}     Termination Protocol:${NC}
		${RED}======================================${NC}

		Once you have secured the Satellite ID, press ${YELLOW}CTRL+C${NC}
		to gracefully terminate the emulation session and complete the setup.

		Good luck, Astronaut! 🧑‍🚀

	EOF

	# Interactive funding loop
	echo ""
	while is_process_running "$JUNO_EMULATOR_PID"; do
		echo -e "${YELLOW}Paste Wallet ID to fund (or ENTER to finish/skip):${NC} \c"
		if read -r wallet_id; then
			# Break loop if input is empty (User pressed Enter)
			if [[ -z $wallet_id ]]; then
				log_info "Funding sequence finished. Emulator remains active."
				break
			fi

			# Use the transfer_cycles_to_wallet function
			if transfer_cycles_to_wallet "$wallet_id" "Wallet"; then
				log_info "If cycles don't appear: Refresh the Console page or check the wallet address."
			fi
		else
			# Handle Ctrl+D (EOF)
			break
		fi
	done

	# Keep the script running to maintain the emulator process
	if [[ -n ${JUNO_EMULATOR_PID:-} ]]; then
		log_info "Emulator is running. Press ${YELLOW}CTRL+C${NC} to stop."
		wait "$JUNO_EMULATOR_PID"
	fi
}

function is_process_running() {
	local pid="$1"
	if [[ -n $pid ]] && kill -0 "$pid" 2>/dev/null; then
		return 0
	fi
	return 1
}

# =============================================================================
# Agent Docs: Download LLM documentation for AI agents
# =============================================================================

AGENT_DOCS_DIR="docs/agents"

# Map of documentation sources: "name|url"
# Add new sources here - name will be lowercased for filename
AGENT_DOC_SOURCES=(
	"avalanche|https://build.avax.network/llms-full.txt"
	"astro|https://docs.astro.build/llms-full.txt"
	"cloudflare|https://developers.cloudflare.com/llms-full.txt"
	"daisyui|https://daisyui.com/llms.txt"
	"foundry|https://getfoundry.sh/llms-full.txt"
	"juno|https://juno.build/llms-full.txt"
	"oisy|https://docs.oisy.com/llms-full.txt"
	"reown|https://docs.reown.com/llms-full.txt"
	"viem|https://viem.sh/llms-full.txt"
	"wagmi|https://wagmi.sh/llms-full.txt"
	"xai|https://docs.x.ai/llms.txt"
)

function cmd_agent_docs() {
	log_info "📚 Downloading AI Agent documentation..."

	mkdir -p "$AGENT_DOCS_DIR"

	local failed=0
	local success=0
	local total=${#AGENT_DOC_SOURCES[@]}
	local current=0

	for entry in "${AGENT_DOC_SOURCES[@]}"; do
		current=$((current + 1))
		# Split entry by pipe
		local name="${entry%%|*}"
		local url="${entry##*|}"
		local filename="${name,,}.txt" # lowercase
		local filepath="${AGENT_DOCS_DIR}/${filename}"

		log_info "[$current/$total] Downloading ${name} docs from ${url}..."

		# Use -f to fail on HTTP errors, wrap in subshell to prevent set -e exit
		if (curl -s --connect-timeout 10 --max-time 120 -f -o "$filepath" "$url" 2>/dev/null); then
			# Check if file has content
			if [[ -s $filepath ]]; then
				local size
				size=$(wc -c <"$filepath")
				log_success "${name} docs saved (${size} bytes)"
				success=$((success + 1))
			else
				log_warn "${name} docs downloaded but file is empty"
				rm -f "$filepath"
				failed=$((failed + 1))
			fi
		else
			log_error "Failed to download ${name} docs (check URL or connectivity)"
			rm -f "$filepath" 2>/dev/null || true
			failed=$((failed + 1))
		fi
	done

	echo ""
	log_info "Download complete: ${success} succeeded, ${failed} failed"

	if [[ $success -gt 0 ]]; then
		log_info ""
		log_info "Documentation files are available in: ${AGENT_DOCS_DIR}/"
		log_info "Run this command periodically to fetch updated documentation."
	fi
}

# =============================================================================
# Update: Update all packages to latest versions with pinned versions
# =============================================================================

function cmd_update_packages() {
	log_info "📦 Updating packages to latest versions..."

	# Check if package.json exists
	if [[ ! -f "package.json" ]]; then
		log_error "package.json not found in current directory"
		return 1
	fi

	# Check if bun is available
	if ! command -v bun &>/dev/null; then
		log_error "bun is not installed or not in PATH"
		return 1
	fi

	# Check if jq is available for JSON manipulation
	if ! command -v jq &>/dev/null; then
		log_error "jq is required for package.json manipulation. Install it first."
		return 1
	fi

	log_info "Checking for outdated packages..."

	# Get list of outdated packages using bun
	local outdated_output
	outdated_output=$(bun outdated 2>/dev/null || true)

	if [[ -z $outdated_output ]] || [[ $outdated_output == *"All packages are up to date"* ]]; then
		log_success "All packages are already up to date!"
		return 0
	fi

	echo "$outdated_output"
	echo ""

	log_info "Updating all packages to latest versions..."

	# Update all packages to their latest versions (ignoring semver ranges)
	# --latest flag updates beyond the semver range in package.json
	if ! bun update --latest; then
		log_error "bun update failed"
		return 1
	fi

	log_info "Pinning package versions (removing ^ and ~ prefixes)..."

	# Create backup
	cp package.json package.json.bak

	# Remove ^ and ~ from version strings in dependencies and devDependencies
	# This pins versions to exact versions
	if jq '
		.dependencies = (.dependencies // {} | with_entries(
			if .value | type == "string" and (startswith("^") or startswith("~"))
			then .value = (.value | ltrimstr("^") | ltrimstr("~"))
			else .
			end
		)) |
		.devDependencies = (.devDependencies // {} | with_entries(
			if .value | type == "string" and (startswith("^") or startswith("~"))
			then .value = (.value | ltrimstr("^") | ltrimstr("~"))
			else .
			end
		))
	' package.json >package.json.tmp; then
		mv package.json.tmp package.json
		rm -f package.json.bak
		log_success "Package versions pinned successfully"
	else
		log_error "Failed to pin versions, restoring backup"
		mv package.json.bak package.json
		return 1
	fi

	# Reinstall with pinned versions to update lockfile
	log_info "Reinstalling with pinned versions..."
	if ! bun install; then
		log_error "bun install failed after pinning versions"
		return 1
	fi

	log_success "All packages updated and pinned to exact versions!"
	log_info ""
	log_info "Review changes with: git diff package.json"
}

# =============================================================================
# Nuke: Full Cleanup + Optional Restart
# =============================================================================

function cmd_nuke_juno() {
	log_info "🧨 Nuking Juno from Orbit..."

	# Stop running emulator
	juno emulator stop >/dev/null 2>&1 || log_warn "Could not stop emulator."

	# Docker cleanup
	if command -v docker >/dev/null; then
		docker container stop juno-skylab >/dev/null 2>&1 || log_warn "Could not stop 'juno-skylab' container."
		docker container rm juno-skylab >/dev/null 2>&1 || log_warn "Could not remove 'juno-skylab' container."
		docker volume rm juno-skylab >/dev/null 2>&1 || log_warn "Could not remove 'juno-skylab' volume."
	fi

	# Local cleanup
	cmd_cleanup

	log_info "Nuking artifact caches..."
	rm -rf \
		target \
		bun.lockdb \
		node_modules \
		dist \
		.cache \
		"${HOME}/.config/juno-"* || log_warn "Could not remove some caches."

	log_success "All done. Juno has now been reset."
}

function cmd_clear_satellite() {
	log_info "🗑️ Clearing satellite..."
	juno hosting clear --mode development || {
		log_error "Could not clear satellite."
		return 1
	}
	log_success "Satellite cleared."
}

# =============================================================================
# Usage & Aliases (Run ./juno-dev.sh <cmd>)
# =============================================================================

case "${1:-help}" in

# Build the static site + serverless functions
build)
	cmd_astro_build || {
		log_error "Could not build the static site."
		exit 1
	}
	cmd_functions_build || {
		log_error "Could not build serverless functions."
		exit 1
	}
	;;

# Build serverless functions only
build-functions | bf)
	cmd_functions_build || {
		log_error "Could not build serverless functions."
		exit 1
	}
	;;

# Deploy serverless functions only
deploy-functions | df)
	cmd_functions_deploy "${2:-development}" || {
		log_error "Could not deploy serverless functions."
		exit 2
	}
	;;

# Deploy to Juno
deploy | d)
	cmd_juno_deploy "${2:-development}" || {
		log_error "Could not deploy to Juno."
		exit 2
	}
	;;

# Deploy to Juno production
"deploy:prod")
	cmd_juno_deploy production || {
		log_error "Could not deploy to Juno production."
		exit 3
	}
	;;

# Start the emulator
start | up | start-emu | start-emulator)
	cmd_juno_emu_start || {
		log_error "Could not start the emulator."
		exit 4
	}
	;;

# Stop the emulator
stop | down | stop-emu | stop-emulator)
	cmd_juno_emu_stop || {
		log_error "Could not stop the emulator."
		exit 5
	}
	;;

# Tail Logs
logs | l)
	logs || {
		log_error "Could not tail logs."
		exit 6
	}
	;;

# Lint the code (prebuild first to regenerate types)
lint)
	bun run prebuild || {
		log_error "Prebuild failed."
		exit 7
	}
	cmd_lint || {
		log_error "Could not lint the code."
		exit 7
	}
	;;

# TypeScript type check
typecheck | tsc)
	cmd_typecheck || {
		log_error "TypeScript type check failed."
		exit 20
	}
	;;

# Clean artifacts
cleanup)
	cmd_cleanup || {
		log_error "Could not clean artifacts."
		exit 8
	}
	;;

# Rebuild the static site
rebuild)
	cmd_rebuild || {
		log_error "Could not rebuild the static site."
		exit 9
	}
	;;

# Generate TypeScript declarations for Candid interfaces
candid)
	cmd_check_didc || {
		log_error "Could not check didc."
		exit 10
	}
	cmd_generate_ts_declarations "src/declarations/satellite" "src/satellite" || {
		log_error "Could not generate TypeScript declarations."
		exit 11
	}
	;;

# Initial Juno Emulator Setup (Funding, etc.)
setup)
	cmd_setup || {
		log_error "Could not setup Juno Emulator."
		exit 12
	}
	;;

# A one-shot clean, check, build, and deploy loop.
oneshot | loop)
	clear
	cmd_cleanup || {
		log_error "Could not clean artifacts."
		exit 8
	}
	log_info "Regenerating client config..."
	bun run client-config || {
		log_error "Could not regenerate client config."
		exit 8
	}
	cmd_lint || {
		log_error "Could not lint the code."
		exit 7
	}
	cmd_typecheck || {
		log_error "TypeScript type check failed."
		exit 20
	}
	# Build once (rebuild does build + candid), then deploy with skip_build
	cmd_rebuild || {
		log_error "Could not rebuild the static site."
		exit 9
	}
	cmd_juno_deploy development true || {
		log_error "Could not deploy the site."
		exit 13
	}
	;;

# Clear satellite data
clear-satellite)
	cmd_clear_satellite || {
		log_error "Could not clear satellite data."
		exit 14
	}
	;;

# Nuke Juno emulator and restart
nuke-juno)
	cmd_nuke_juno || {
		log_error "Could not nuke Juno emulator."
		exit 15
	}
	;;

# Top-up all development canisters
topup | top-up | fund)
	cmd_topup "$@" || {
		log_error "Could not top up canisters."
		exit 16
	}
	;;

# Top-up a specific wallet
topup-wallet | fund-wallet)
	cmd_topup_wallet "$2" || {
		log_error "Could not top up wallet."
		exit 17
	}
	;;

# Download AI agent documentation
agent-docs | docs)
	cmd_agent_docs || {
		log_error "Could not download agent docs."
		exit 18
	}
	;;

# Update packages to latest versions with pinned versions
update | upgrade)
	cmd_update_packages || {
		log_error "Could not update packages."
		exit 19
	}
	;;

*)
	echo "Usage: $0 {build|build-functions|deploy [dev/prod]|deploy-functions|start|stop|logs|lint|typecheck|cleanup|rebuild|candid|setup|topup|topup-wallet|agent-docs|update|clear-satellite|nuke-juno|loop|oneshot}"
	exit 1
	;;
esac
