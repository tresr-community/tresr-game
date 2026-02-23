//! Data types for Tresr game backend
//!
//! These types are serialized/deserialized from Juno Datastore documents.
//! The frontend stores these as JSON in setDoc() calls, and hooks decode them.

use candid::CandidType;
use serde::{Deserialize, Deserializer, Serialize};

// =============================================================================
// Flexible u64 deserializer
// =============================================================================
//
// The TypeScript frontend uses `bigint` for numeric fields like highScore,
// totalGamesPlayed, balance, etc.  Juno's setDoc serialises these as **strings**
// ("2340"), plain numbers (2340), or occasionally as wrapper objects
// ({"__bigint__": "2340"}).  Rust serde expects a plain u64 and panics on
// anything else.  This module converts all three representations to u64.

/// Deserialize a u64 that may arrive as a number, a string, or a map wrapper.
fn deserialize_flexible_u64<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::{self, MapAccess, Visitor};
    use std::fmt;

    struct FlexU64;

    impl<'de> Visitor<'de> for FlexU64 {
        type Value = u64;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("a u64, a numeric string, or a wrapped bigint object")
        }

        fn visit_u64<E: de::Error>(self, v: u64) -> Result<u64, E> {
            Ok(v)
        }

        fn visit_i64<E: de::Error>(self, v: i64) -> Result<u64, E> {
            u64::try_from(v).map_err(de::Error::custom)
        }

        fn visit_f64<E: de::Error>(self, v: f64) -> Result<u64, E> {
            if v >= 0.0 && v <= u64::MAX as f64 {
                Ok(v as u64)
            } else {
                Err(de::Error::custom(format!("f64 {} out of u64 range", v)))
            }
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<u64, E> {
            v.parse::<u64>().map_err(de::Error::custom)
        }

        fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<u64, M::Error> {
            // Handle wrapper objects like {"__bigint__": "123"}
            let mut value: Option<u64> = None;
            while let Some(key) = map.next_key::<String>()? {
                let raw: String = map.next_value()?;
                // Take the LAST numeric-looking value from the map
                if let Ok(n) = raw.parse::<u64>() {
                    value = Some(n);
                }
                let _ = key; // consume key
            }
            value.ok_or_else(|| de::Error::custom("map wrapper contained no numeric value"))
        }
    }

    deserializer.deserialize_any(FlexU64)
}

/// Same as above but for `Option<u64>` fields.
fn deserialize_flexible_option_u64<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: Deserializer<'de>,
{
    use serde::de::{self, MapAccess, Visitor};
    use std::fmt;

    struct FlexOptU64;

    impl<'de> Visitor<'de> for FlexOptU64 {
        type Value = Option<u64>;

        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("null, a u64, a numeric string, or a wrapped bigint object")
        }

        fn visit_none<E: de::Error>(self) -> Result<Option<u64>, E> {
            Ok(None)
        }

        fn visit_unit<E: de::Error>(self) -> Result<Option<u64>, E> {
            Ok(None)
        }

        fn visit_some<D2: Deserializer<'de>>(self, d: D2) -> Result<Option<u64>, D2::Error> {
            deserialize_flexible_u64(d).map(Some)
        }

        fn visit_u64<E: de::Error>(self, v: u64) -> Result<Option<u64>, E> {
            Ok(Some(v))
        }

        fn visit_i64<E: de::Error>(self, v: i64) -> Result<Option<u64>, E> {
            u64::try_from(v).map(Some).map_err(de::Error::custom)
        }

        fn visit_f64<E: de::Error>(self, v: f64) -> Result<Option<u64>, E> {
            if v >= 0.0 && v <= u64::MAX as f64 {
                Ok(Some(v as u64))
            } else {
                Err(de::Error::custom(format!("f64 {} out of u64 range", v)))
            }
        }

        fn visit_str<E: de::Error>(self, v: &str) -> Result<Option<u64>, E> {
            v.parse::<u64>().map(Some).map_err(de::Error::custom)
        }

        fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Option<u64>, M::Error> {
            let mut value: Option<u64> = None;
            while let Some(key) = map.next_key::<String>()? {
                let raw: String = map.next_value()?;
                if let Ok(n) = raw.parse::<u64>() {
                    value = Some(n);
                }
                let _ = key;
            }
            Ok(value)
        }
    }

    deserializer.deserialize_any(FlexOptU64)
}

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
    #[serde(
        default,
        rename = "verification_signature",
        skip_serializing_if = "Option::is_none"
    )]
    pub verification_signature: Option<String>,

    /// Message signed (optional, used during linking)
    #[serde(
        default,
        rename = "verification_message",
        skip_serializing_if = "Option::is_none"
    )]
    pub verification_message: Option<String>,

    /// Withdrawal address
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub withdrawal_address: Option<String>,

    /// Notifications (nested array, managed by frontend)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notifications: Option<serde_json::Value>,

    /// Epoch ms timestamp until user is banned. None = not banned.
    #[serde(
        default,
        rename = "banned_until",
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_flexible_option_u64"
    )]
    pub banned_until: Option<u64>,

    /// Cumulative cheat detection count. Escalates ban duration.
    #[serde(
        default,
        rename = "offence_count",
        deserialize_with = "deserialize_flexible_u64"
    )]
    pub offence_count: u64,
}

/// Nested stats object matching TypeScript `stats` field
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserStats {
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub high_score: u64,
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub total_games_played: u64,
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub total_games_won: u64,
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub total_games_lost: u64,
}

/// Nested wallet object matching TypeScript `wallet` field
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UserWallet {
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub balance: u64,
    #[serde(default)]
    pub evm_wallet_linked: bool,
}

/// Nested preferences object matching TypeScript `preferences` field
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
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
// Leaderboard Entry (stored in "leaderboard" collection)
// =============================================================================

/// Sanitized public leaderboard entry.
/// Contains only non-sensitive data: nickname and game stats.
/// Written by the `on_set_doc("users")` hook whenever a user profile is saved.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LeaderboardEntry {
    pub nickname: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    // --- ALL TIME ---
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub high_score: u64,
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub games_won: u64,
    // --- ACTIVE (decays) ---
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub active_score: u64,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_flexible_option_u64"
    )]
    pub scored_at: Option<u64>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_flexible_option_u64"
    )]
    pub expires_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

// =============================================================================
// Global Stats (stored in "stats" collection)
// =============================================================================

/// Aggregate burn and payout statistics.
/// Single document with key "global", written by satellite hooks.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GlobalStats {
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub total_fees: u64,
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub total_burned: u64,
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub total_rewarded: u64,
}

// =============================================================================
// Fee Request (stored in "fees" collection)
// =============================================================================

/// Fee request for verification
/// Document key: EVM transaction hash
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct FeeRequest {
    /// EVM transaction hash
    pub tx_hash: String,

    /// Amount in tokens (not wei)
    #[serde(deserialize_with = "deserialize_flexible_u64")]
    pub amount: u64,

    /// Current status of the fee
    pub status: FeeStatus,

    /// Timestamp when verified (if verified)
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_flexible_option_u64"
    )]
    pub verified_at: Option<u64>,

    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(CandidType, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FeeStatus {
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
    #[serde(deserialize_with = "deserialize_flexible_u64")]
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
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub keys_collected: u64,

    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,

    /// Claim type: "boss_kill" (default) or "consolation"
    #[serde(default = "default_claim_type")]
    pub claim_type: String,
}

fn default_claim_type() -> String {
    "boss_kill".to_string()
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
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    /// When the session started (Unix timestamp ms)
    #[serde(deserialize_with = "deserialize_flexible_u64")]
    pub started_at: u64,

    /// When the session ended (Unix timestamp ms)
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_flexible_option_u64"
    )]
    pub ended_at: Option<u64>,

    /// Number of keys collected
    #[serde(deserialize_with = "deserialize_flexible_u64")]
    pub keys_collected: u64,

    /// Whether the boss was defeated
    pub boss_defeated: bool,

    /// Final score
    #[serde(deserialize_with = "deserialize_flexible_u64")]
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
    #[serde(
        skip_serializing_if = "Option::is_none",
        default,
        deserialize_with = "deserialize_flexible_option_u64"
    )]
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
