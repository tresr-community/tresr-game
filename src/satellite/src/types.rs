//! Data types for Tresr game backend
//!
//! These types are serialized/deserialized from Juno Datastore documents.
//! The frontend stores these as JSON in setDoc() calls, and hooks decode them.

use candid::CandidType;
use serde::{Deserialize, Serialize};

// =============================================================================
// User Profile (stored in "users" collection)
// =============================================================================

/// User profile data stored in Juno Datastore.
/// Matches the TypeScript `UserProfile` interface in `src/types/backend.ts`.
/// Document key: user's principal ID (text).
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserProfile {
    /// User's principal ID
    #[serde(default)]
    pub user_id: String,

    /// Display name
    #[serde(default)]
    pub nickname: String,

    /// How user authenticated
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login_method: Option<String>,

    /// Game statistics (nested object)
    #[serde(default)]
    pub stats: UserStats,

    /// Wallet info (nested object)
    #[serde(default)]
    pub wallet: UserWallet,

    /// User preferences (nested object)
    #[serde(default)]
    pub preferences: UserPreferences,

    /// Contact email
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,

    /// Avalanche wallet address (0x...)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evm_wallet: Option<String>,

    /// Wallet proof signature
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wallet_proof: Option<String>,

    /// Signature for verification (optional, used during linking)
    #[serde(default, rename = "verification_signature", skip_serializing_if = "Option::is_none")]
    pub verification_signature: Option<String>,

    /// Message signed (optional, used during linking)
    #[serde(default, rename = "verification_message", skip_serializing_if = "Option::is_none")]
    pub verification_message: Option<String>,

    /// Withdrawal address
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub withdrawal_address: Option<String>,

    /// Notifications (nested array, managed by frontend)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notifications: Option<serde_json::Value>,

    /// Epoch ms timestamp until user is banned. None = not banned.
    #[serde(default, rename = "banned_until", skip_serializing_if = "Option::is_none")]
    pub banned_until: Option<u64>,

    /// Cumulative cheat detection count. Escalates ban duration.
    #[serde(default, rename = "offence_count")]
    pub offence_count: u64,
}

/// Nested stats object matching TypeScript `stats` field
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserStats {
    #[serde(default)]
    pub high_score: u64,
    #[serde(default)]
    pub total_games_played: u64,
    #[serde(default)]
    pub total_games_won: u64,
    #[serde(default)]
    pub total_games_lost: u64,
}

/// Nested wallet object matching TypeScript `wallet` field
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UserWallet {
    #[serde(default)]
    pub balance: u64,
    #[serde(default)]
    pub evm_wallet_linked: bool,
}

/// Nested preferences object matching TypeScript `preferences` field
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserPreferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default, rename = "has_read_instructions")]
    pub has_read_instructions: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub narration: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub music: Option<serde_json::Value>,
}

impl Default for UserPreferences {
    fn default() -> Self {
        Self {
            avatar_url: None,
            theme: "synthwave".to_string(),
            has_read_instructions: false,
            narration: None,
            music: None,
        }
    }
}

fn default_theme() -> String {
    "synthwave".to_string()
}

// =============================================================================
// Deposit Request (stored in "deposits" collection)
// =============================================================================

/// Deposit request for verification
/// Document key: EVM transaction hash
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct DepositRequest {
    /// EVM transaction hash
    pub tx_hash: String,

    /// Amount in tokens (not wei)
    pub amount: u64,

    /// Current status of the deposit
    pub status: DepositStatus,

    /// Timestamp when verified (if verified)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verified_at: Option<u64>,

    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum DepositStatus {
    Pending,
    Verified,
    Failed,
}

// =============================================================================
// Claim Request (stored in "claims" collection)
// =============================================================================

/// Reward claim request
/// Document key: auto-generated UUID
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct ClaimRequest {
    /// Amount to claim in tokens
    pub amount: u64,

    /// Current status of the claim
    pub status: ClaimStatus,

    /// ECDSA signature from oracle for claim authorization
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,

    /// EVM transaction hash once processed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_hash: Option<String>,

    /// Links to game session for anti-cheat validation
    pub game_session_id: String,

    /// Number of keys collected (passed to Vault.claim for signature verification)
    #[serde(default)]
    pub keys_collected: u64,

    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ClaimStatus {
    Pending,
    ReadyForChain,
    Processing,
    Completed,
    Failed,
}

// =============================================================================
// Game Session (stored in "game_sessions" collection)
// =============================================================================

/// Game session data for validation
/// Document key: session UUID
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct GameSession {
    /// When the session started (Unix timestamp ms)
    pub started_at: u64,

    /// When the session ended (Unix timestamp ms)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<u64>,

    /// Number of keys collected
    pub keys_collected: u64,

    /// Whether the boss was defeated
    pub boss_defeated: bool,

    /// Final score
    pub score: u64,

    /// Whether reward has been claimed for this session
    #[serde(default)]
    pub reward_claimed: bool,
}

// =============================================================================
// Balance Refresh Request (stored in "balance_refresh" collection)
// =============================================================================

/// Request to refresh balance from on-chain
/// Document key: user's principal ID
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct BalanceRefreshRequest {
    /// Wallet address to check balance for
    pub evm_wallet: String,

    /// Status of the refresh
    pub status: RefreshStatus,

    /// The refreshed balance (once complete)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub balance: Option<u64>,

    /// Error if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RefreshStatus {
    Pending,
    Completed,
    Failed,
}

// =============================================================================
// EVM RPC Types (internal use)
// =============================================================================

/// JSON-RPC request structure for EVM calls
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct RpcRequest {
    pub jsonrpc: String,
    pub method: String,
    pub params: String,
    pub id: u64,
}

/// JSON-RPC response structure from EVM calls
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct RpcResponse {
    pub jsonrpc: String,
    pub result: Option<String>,
    pub error: Option<RpcError>,
    pub id: u64,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
}
