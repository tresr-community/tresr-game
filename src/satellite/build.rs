//! Build script — reads config/tresr.yaml and server-constants.ts to generate Rust constants.
//!
//! Generated file: `$OUT_DIR/generated_config.rs`
//! Network selection: `SATELLITE_NETWORK` env var (default: "mainnet")

use serde::Deserialize;
use std::env;
use std::fs;
use std::path::Path;

// Minimal structs — only the fields the satellite needs.

#[derive(Deserialize)]
struct Config {
    server: Server,
    client: Client,
}

#[derive(Deserialize)]
struct Server {
    juno: Juno,
    anti_cheat: AntiCheat,
    highscore: Highscore,
}

#[derive(Deserialize)]
struct Juno {
    #[serde(default)]
    admins: Vec<String>,
}

#[derive(Deserialize)]
struct AntiCheat {
    max_score: u64,
    ban_durations_hours: Vec<u64>,
    permanent_after_offence: u64,
    replay: Replay,
}

#[derive(Deserialize)]
struct Replay {
    max_actions: u64,
    min_action_gap_ms: u64,
    min_attack_gap_ms: u64,
    grace_ms: u64,
    burst_limit_per_100ms: u64,
    min_actions: u64,
    attack_per_key_divisor: u64,
}

#[derive(Deserialize)]
struct Highscore {
    score_ttl_hours: u64,
    consolation_prize_percent: u64,
    consolation_prize_min_games: u64,
    consolation_prize_expiration_days: u64,
}

#[derive(Deserialize)]
struct Client {
    blockchain: Blockchain,
    gameplay: Gameplay,
}

#[derive(Deserialize)]
struct Gameplay {
    max_keys: u64,
    time_limit_seconds: u64,
    vault: VaultConfig,
}

#[derive(Deserialize)]
struct VaultConfig {
    payout_max_score: u64,
    tiers: VaultTiers,
    payout_fixed: PayoutFixed,
    payout_percentages: PayoutPercentages,
    payout_curve: Vec<CurvePoint>,
}

#[derive(Deserialize)]
struct CurvePoint {
    score: u64,
    percent: u64,
}

#[derive(Deserialize)]
struct VaultTiers {
    building: u64,
    sweet_spot: u64,
    fomo: u64,
}

#[derive(Deserialize)]
struct PayoutFixed {
    building: u64,
}

#[derive(Deserialize)]
struct PayoutPercentages {
    sweet_spot: u64,
    fomo: u64,
    legendary: u64,
}

#[derive(Deserialize)]
struct Blockchain {
    avalanche: AvalancheNetworks,
    icp: Icp,
}

#[derive(Deserialize)]
struct AvalancheNetworks {
    anvil: AvalancheNetwork,
    testnet: AvalancheNetwork,
    mainnet: AvalancheNetwork,
}

#[derive(Deserialize)]
struct AvalancheNetwork {
    fee: u64,
    burn_rate: u64,
    chain_id: u64,
    // rpc_urls removed: satellite now reads from blockchain.icp.evm_rpc.*.rpc_url(s)
    // The browser still uses blockchain.avalanche.*.rpc_urls via bin/client-config.ts.
    #[serde(default)]
    allowed_origins: Vec<String>,
    vault_contract: String,
    tresr_token_contract: String,
    token_ticker: String,
}

/// Per-network EVM RPC canister configuration (satellite-only).
#[derive(Deserialize)]
struct EvmRpcNetwork {
    canister_id: String,
    /// Anvil only — single custom RPC URL for the local Docker-accessible endpoint.
    rpc_url: Option<String>,
    /// Testnet / mainnet — multiple custom provider URLs for multi-provider consensus.
    #[serde(default)]
    rpc_urls: Vec<String>,
}

#[derive(Deserialize)]
struct EvmRpc {
    anvil: EvmRpcNetwork,
    testnet: EvmRpcNetwork,
    mainnet: EvmRpcNetwork,
}

#[derive(Deserialize)]
struct Icp {
    evm_rpc: EvmRpc,
}

fn main() {
    // Re-run when config changes
    println!("cargo::rerun-if-changed=../../config/tresr.yaml");
    println!("cargo::rerun-if-changed=../../src/lib/config/server-constants.ts");
    println!("cargo::rerun-if-env-changed=SATELLITE_NETWORK");

    // Read config
    let yaml_path = Path::new("../../config/tresr.yaml");
    let yaml_str = fs::read_to_string(yaml_path).unwrap_or_else(|e| {
        panic!(
            "Failed to read config/tresr.yaml at {}: {}",
            yaml_path.display(),
            e
        )
    });

    let config: Config = serde_yaml::from_str(&yaml_str).unwrap_or_else(|e| {
        panic!("Failed to parse tresr.yaml: {}", e);
    });

    // Read SERVER_CONFIG_HASH from auto-generated server-constants.ts (#41)
    let constants_path = Path::new("../../src/lib/config/server-constants.ts");
    let constants_str = fs::read_to_string(constants_path).unwrap_or_else(|e| {
        panic!(
            "Failed to read server-constants.ts at {}: {}",
            constants_path.display(),
            e
        )
    });
    let config_hash = constants_str
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with("export const SERVER_CONFIG_HASH") {
                // Extract hex string between quotes
                trimmed.split('"').nth(1)
            } else {
                None
            }
        })
        .unwrap_or_else(|| panic!("SERVER_CONFIG_HASH not found in server-constants.ts"));
    // Validate it looks like a SHA-256 hex digest
    assert!(
        config_hash.len() == 64 && config_hash.chars().all(|c| c.is_ascii_hexdigit()),
        "SERVER_CONFIG_HASH is not a valid 64-char hex string: '{}'",
        config_hash
    );

    // Select network (default: mainnet)
    let network = env::var("SATELLITE_NETWORK").unwrap_or_else(|_| "mainnet".to_string());
    let chain = match network.as_str() {
        "anvil" => &config.client.blockchain.avalanche.anvil,
        "testnet" => &config.client.blockchain.avalanche.testnet,
        "mainnet" => &config.client.blockchain.avalanche.mainnet,
        other => panic!(
            "Unknown SATELLITE_NETWORK: '{}'. Use anvil, testnet, or mainnet.",
            other
        ),
    };

    // Format ban durations as Rust array literal
    let ban_durations = config
        .server
        .anti_cheat
        .ban_durations_hours
        .iter()
        .map(|d: &u64| d.to_string())
        .collect::<Vec<_>>()
        .join(", ");

    // Select EVM RPC config for this network (satellite-only, from blockchain.icp.evm_rpc)
    let evm_rpc_net = match network.as_str() {
        "anvil" => &config.client.blockchain.icp.evm_rpc.anvil,
        "testnet" => &config.client.blockchain.icp.evm_rpc.testnet,
        "mainnet" => &config.client.blockchain.icp.evm_rpc.mainnet,
        other => panic!("Unknown SATELLITE_NETWORK for icp.evm_rpc: '{}'", other),
    };

    // Build satellite RPC URL list:
    //   anvil   — singular rpc_url (Docker host via host.docker.internal)
    //   others  — rpc_urls list  (Ankr, DRPC, PublicNode, … for multi-provider consensus)
    let satellite_rpc_urls: Vec<String> = if let Some(url) = &evm_rpc_net.rpc_url {
        vec![format!(r#""{}""#, url)]
    } else {
        evm_rpc_net
            .rpc_urls
            .iter()
            .map(|u| format!(r#""{}""#, u))
            .collect()
    };
    let satellite_rpc_urls_str = satellite_rpc_urls.join(", ");

    // Format allowed origins as Rust array literal
    let allowed_origins = chain
        .allowed_origins
        .iter()
        .map(|u| format!(r#""{}""#, u))
        .collect::<Vec<_>>()
        .join(", ");

    // Format admin principals as Rust array literal
    let admin_principals = config
        .server
        .juno
        .admins
        .iter()
        .map(|p| format!(r#""{}""#, p))
        .collect::<Vec<_>>()
        .join(", ");

    // Format payout curve as Rust array of tuples
    let payout_curve_str = config
        .client
        .gameplay
        .vault
        .payout_curve
        .iter()
        .map(|p| format!("({}, {})", p.score, p.percent))
        .collect::<Vec<_>>()
        .join(", ");

    // Generate Rust constants
    let ecdsa_key_name = match network.as_str() {
        "mainnet" => "key_1",
        _ => "test_key_1", // anvil + testnet use the IC test key
    };

    let generated = format!(
        r#"// Auto-generated by build.rs from config/tresr.yaml — DO NOT EDIT
// Network: {network}

/// Ban durations in hours (from server.anti_cheat.ban_durations_hours)
pub const BAN_DURATIONS_HOURS: &[u64] = &[{ban_durations}];

/// Offence count at which ban becomes permanent (from server.anti_cheat.permanent_after_offence)
pub const PERMANENT_AFTER_OFFENCE: u64 = {permanent};

/// Maximum keys a player can collect per session (from client.gameplay.max_keys)
pub const MAX_KEYS_COLLECTED: u64 = {max_keys};

/// Maximum score achievable before being considered a cheater (from server.anti_cheat.max_score)
pub const ANTI_CHEAT_MAX_SCORE: u64 = {anti_cheat_max_score};

/// The maximum score achievable for 100% of payout matching the vault tier limit (from client.gameplay.vault.payout_max_score)
pub const PAYOUT_MAX_SCORE: u64 = {payout_max_score};

/// Array of (score, percent) points for piecewise linear payout calculation (from client.gameplay.vault.payout_curve)
pub const PAYOUT_CURVE: &[(u64, u64)] = &[{payout_curve}];

/// EVM RPC canister ID on the Internet Computer (from client.blockchain.icp.evm_rpc.{network}.canister_id)
pub const EVM_RPC_CANISTER_ID: &str = "{evm_rpc_canister_id}";

/// Avalanche chain ID for the selected network (from client.blockchain.avalanche.{network}.chain_id)
pub const AVALANCHE_CHAIN_ID: u64 = {chain_id};

/// Vault contract address on Avalanche (from client.blockchain.avalanche.{network}.vault_contract)
pub const VAULT_CONTRACT_ADDRESS: &str = "{vault_contract}";

/// TRESR token contract address on Avalanche (from client.blockchain.avalanche.{network}.tresr_token_contract)
pub const TRESR_TOKEN_CONTRACT: &str = "{token_contract}";

/// TRESR token ticker symbol (from client.blockchain.avalanche.{network}.token_ticker)
pub const TRESR_TOKEN_TICKER: &str = "{token_ticker}";

/// Entry fee in tokens (from client.blockchain.avalanche.{network}.fee)
pub const FEE: u64 = {fee};

/// Burn rate in basis points, 1000 = 10% (from client.blockchain.avalanche.{network}.burn_rate)
pub const BURN_RATE_BPS: u64 = {burn_rate};

/// Avalanche RPC URLs for multi-provider consensus (from client.blockchain.icp.evm_rpc.{network}.rpc_url(s))
/// Satellite-only: the browser uses client.blockchain.avalanche.{network}.rpc_urls instead.
pub const AVALANCHE_RPC_URLS: &[&str] = &[{rpc_urls}];

/// Allowed browser origins for wallet-link domain binding (from client.blockchain.avalanche.{network}.allowed_origins)
pub const ALLOWED_ORIGINS: &[&str] = &[{allowed_origins}];

/// Network name for conditional logic (anvil/testnet/mainnet)
pub const NETWORK_NAME: &str = "{network}";

/// ECDSA key name for IC threshold signing (test_key_1 for dev/staging, key_1 for production)
pub const ECDSA_KEY_NAME: &str = "{ecdsa_key_name}";

/// Active score TTL in hours (from server.highscore.score_ttl_hours)
pub const SCORE_TTL_HOURS: u64 = {score_ttl_hours};

/// Consolation prize percentage of vault balance (from server.highscore.consolation_prize_percent)
pub const CONSOLATION_PRIZE_PERCENT: u64 = {consolation_prize_percent};

/// Minimum games played to qualify for consolation prize (from server.highscore.consolation_prize_min_games)
pub const CONSOLATION_PRIZE_MIN_GAMES: u64 = {consolation_prize_min_games};

/// Consolation prize expiration in days (from server.highscore.consolation_prize_expiration_days)
pub const CONSOLATION_PRIZE_EXPIRATION_DAYS: u64 = {consolation_prize_expiration_days};

/// Vault Tier Building threshold in tokens
pub const VAULT_TIER_BUILDING: u64 = {vault_tier_building};

/// Vault Tier Sweet Spot threshold in tokens
pub const VAULT_TIER_SWEET_SPOT: u64 = {vault_tier_sweet_spot};

/// Vault Tier FOMO threshold in tokens
pub const VAULT_TIER_FOMO: u64 = {vault_tier_fomo};

/// Fixed Payout for Building Tier in tokens
pub const PAYOUT_FIXED_BUILDING: u64 = {payout_fixed_building};

/// Payout percentage for Sweet Spot Tier
pub const PAYOUT_PERCENT_SWEET_SPOT: u64 = {payout_percent_sweet_spot};

/// Payout percentage for FOMO Tier
pub const PAYOUT_PERCENT_FOMO: u64 = {payout_percent_fomo};

/// Payout percentage for Legendary Tier
pub const PAYOUT_PERCENT_LEGENDARY: u64 = {payout_percent_legendary};

/// SHA-256 config hash for anti-cheat validation (from server-constants.ts, ticket #41)
pub const CONFIG_HASH: &str = "{config_hash}";

/// Admin principals allowed to call admin-only satellite functions (from server.juno.admins)
pub const ADMIN_PRINCIPALS: &[&str] = &[{admin_principals}];

/// Game time limit in milliseconds — used to sanity-check replay duration (#171)
pub const TIME_LIMIT_MS: u64 = {time_limit_ms};

/// Maximum recorded actions per session — must match Recorder::MAX_ACTIONS in TS (#171)
pub const REPLAY_MAX_ACTIONS: u64 = {replay_max_actions};

/// Minimum gap between any two consecutive actions in ms — one browser frame (#171)
pub const REPLAY_MIN_ACTION_GAP_MS: u64 = {replay_min_action_gap_ms};

/// Minimum gap between consecutive attack actions — conservative human limit (#171)
pub const REPLAY_MIN_ATTACK_GAP_MS: u64 = {replay_min_attack_gap_ms};

/// Grace period added to TIME_LIMIT_MS for replay timestamp validation (#171)
pub const REPLAY_GRACE_MS: u64 = {replay_grace_ms};

/// Max actions in any 100ms sliding window — tuned for legit 60fps button mashing (#171)
pub const REPLAY_BURST_LIMIT_PER_100MS: u64 = {replay_burst_limit_per_100ms};

/// Minimum total replay actions to accept a session as non-trivial (#171)
pub const REPLAY_MIN_ACTIONS: u64 = {replay_min_actions};

/// Divisor for attack-to-key ratio check: attacks >= keys / divisor (#171)
pub const REPLAY_ATTACK_PER_KEY_DIVISOR: u64 = {replay_attack_per_key_divisor};
"#,
        network = network,
        ban_durations = ban_durations,
        permanent = config.server.anti_cheat.permanent_after_offence,
        max_keys = config.client.gameplay.max_keys,
        anti_cheat_max_score = config.server.anti_cheat.max_score,
        payout_max_score = config.client.gameplay.vault.payout_max_score,
        payout_curve = payout_curve_str,
        evm_rpc_canister_id = &evm_rpc_net.canister_id,
        chain_id = chain.chain_id,
        vault_contract = chain.vault_contract,
        token_contract = chain.tresr_token_contract,
        token_ticker = chain.token_ticker,
        fee = chain.fee,
        burn_rate = chain.burn_rate,
        rpc_urls = satellite_rpc_urls_str,
        allowed_origins = allowed_origins,
        ecdsa_key_name = ecdsa_key_name,
        score_ttl_hours = config.server.highscore.score_ttl_hours,
        consolation_prize_percent = config.server.highscore.consolation_prize_percent,
        consolation_prize_min_games = config.server.highscore.consolation_prize_min_games,
        consolation_prize_expiration_days =
            config.server.highscore.consolation_prize_expiration_days,
        vault_tier_building = config.client.gameplay.vault.tiers.building,
        vault_tier_sweet_spot = config.client.gameplay.vault.tiers.sweet_spot,
        vault_tier_fomo = config.client.gameplay.vault.tiers.fomo,
        payout_fixed_building = config.client.gameplay.vault.payout_fixed.building,
        payout_percent_sweet_spot = config.client.gameplay.vault.payout_percentages.sweet_spot,
        payout_percent_fomo = config.client.gameplay.vault.payout_percentages.fomo,
        payout_percent_legendary = config.client.gameplay.vault.payout_percentages.legendary,
        config_hash = config_hash,
        admin_principals = admin_principals,
        time_limit_ms = config.client.gameplay.time_limit_seconds * 1000,
        replay_max_actions = config.server.anti_cheat.replay.max_actions,
        replay_min_action_gap_ms = config.server.anti_cheat.replay.min_action_gap_ms,
        replay_min_attack_gap_ms = config.server.anti_cheat.replay.min_attack_gap_ms,
        replay_grace_ms = config.server.anti_cheat.replay.grace_ms,
        replay_burst_limit_per_100ms = config.server.anti_cheat.replay.burst_limit_per_100ms,
        replay_min_actions = config.server.anti_cheat.replay.min_actions,
        replay_attack_per_key_divisor = config.server.anti_cheat.replay.attack_per_key_divisor,
    );

    // Write to OUT_DIR
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR not set");
    let dest_path = Path::new(&out_dir).join("generated_config.rs");
    fs::write(&dest_path, generated).unwrap_or_else(|e| {
        panic!("Failed to write {}: {}", dest_path.display(), e);
    });
}
