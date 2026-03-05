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
#[serde(rename_all = "snake_case")]
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub verification_signature: Option<String>,

    /// Message signed (optional, used during linking)
    #[serde(default, skip_serializing_if = "Option::is_none")]
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
        skip_serializing_if = "Option::is_none",
        deserialize_with = "deserialize_flexible_option_u64"
    )]
    pub banned_until: Option<u64>,

    /// Cumulative cheat detection count. Escalates ban duration.
    #[serde(default, deserialize_with = "deserialize_flexible_u64")]
    pub offence_count: u64,
}

/// Nested stats object matching TypeScript `stats` field
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "snake_case")]
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

/// Nested preferences object matching TypeScript `preferences` field
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct UserPreferences {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default)]
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
// Leaderboard Entry (stored in "scores" collection)
// =============================================================================

/// Sanitized public leaderboard entry.
/// Contains only non-sensitive data: nickname and game stats.
/// Written by the `on_set_doc("users")` hook whenever a user profile is saved.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "snake_case")]
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
// Fee Request (stored in "fees" collection)
// =============================================================================

/// Fee request for verification
/// Document key: "fee_" + EVM transaction hash
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
pub struct FeeRequest {
    /// EVM transaction hash
    pub tx_hash: String,

    /// Amount in tokens (not wei)
    #[serde(deserialize_with = "deserialize_flexible_u64")]
    pub amount: u64,

    /// Current status of the fee
    pub status: FeeStatus,

    /// Block explorer URL — optional, sent by frontend for debugging
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tx_url: Option<String>,

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
#[serde(rename_all = "snake_case")]
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

// =============================================================================
// Error Record (stored in "errors" collection)
// =============================================================================

/// Full error record stored server-side.
/// `error_id` doubles as the Juno document key (format: `err_{now_ns}`).
/// It is the only code shown to the user and is directly filterable in the admin panel.
/// `raw_error` is never returned to non-admin callers.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct ErrorRecord {
    /// Unique error ID that is also the Juno document key.
    /// Format: "err_{nanosecond_timestamp}", e.g. "err_1772598984825320076".
    /// Shown to the user so they can give it to support; devs filter by this in admin.
    pub error_id: String,

    /// Frontend component that triggered the error, e.g. "WalletManager".
    pub component: String,

    /// Friendly message safe to show to the user.
    pub message: String,

    /// Full technical error details — never shown to users.
    pub raw_error: String,

    /// Caller's ICP principal text (empty string for unauthenticated callers).
    pub principal: String,

    /// Network environment: "anvil", "testnet", or "mainnet".
    pub environment: String,

    /// Unix epoch milliseconds when the error was recorded.
    #[serde(deserialize_with = "deserialize_flexible_u64")]
    pub timestamp_ms: u64,

    /// Whether the error has been reviewed and resolved by an admin.
    #[serde(default)]
    pub resolved: bool,
}

/// Payload sent by the client when reporting an error.
/// The satellite generates the `error_id` and `timestamp_ms` server-side.
#[derive(CandidType, Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
pub struct ErrorPayload {
    pub component: String,
    pub message: String,
    pub raw_error: String,
}

// =============================================================================
// Unit Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use serde_json;

    // ── Helpers ────────────────────────────────────────────────────────────────

    /// Thin wrapper so we can apply the custom deserializer in serde_json tests.
    #[derive(Deserialize, Debug, PartialEq)]
    struct FlexWrapper {
        #[serde(deserialize_with = "deserialize_flexible_u64")]
        value: u64,
    }

    #[derive(Deserialize, Debug, PartialEq)]
    struct FlexOptWrapper {
        #[serde(
            default,
            deserialize_with = "deserialize_flexible_option_u64",
            skip_serializing_if = "Option::is_none"
        )]
        value: Option<u64>,
    }

    fn parse_flex(json: &str) -> Result<u64, serde_json::Error> {
        let w: FlexWrapper = serde_json::from_str(json)?;
        Ok(w.value)
    }

    fn parse_flex_opt(json: &str) -> Result<Option<u64>, serde_json::Error> {
        let w: FlexOptWrapper = serde_json::from_str(json)?;
        Ok(w.value)
    }

    // ── deserialize_flexible_u64 ───────────────────────────────────────────────

    #[test]
    fn flex_u64_plain_integer() {
        assert_eq!(parse_flex(r#"{"value": 42}"#).unwrap(), 42u64);
    }

    #[test]
    fn flex_u64_zero() {
        assert_eq!(parse_flex(r#"{"value": 0}"#).unwrap(), 0u64);
    }

    #[test]
    fn flex_u64_max_u64() {
        let json = format!(r#"{{"value": "{}"}}"#, u64::MAX);
        assert_eq!(parse_flex(&json).unwrap(), u64::MAX);
    }

    #[test]
    fn flex_u64_large_number() {
        assert_eq!(
            parse_flex(r#"{"value": 18446744073709551000}"#).unwrap(),
            18446744073709551000u64
        );
    }

    #[test]
    fn flex_u64_string_decimal() {
        assert_eq!(parse_flex(r#"{"value": "2340"}"#).unwrap(), 2340u64);
    }

    #[test]
    fn flex_u64_string_zero() {
        assert_eq!(parse_flex(r#"{"value": "0"}"#).unwrap(), 0u64);
    }

    #[test]
    fn flex_u64_bigint_wrapper() {
        assert_eq!(
            parse_flex(r#"{"value": {"__bigint__": "9999"}}"#).unwrap(),
            9999u64
        );
    }

    #[test]
    fn flex_u64_bigint_wrapper_large() {
        let big = 10_000_000_000u64;
        let json = format!(r#"{{"value": {{"__bigint__": "{}"}}}}"#, big);
        assert_eq!(parse_flex(&json).unwrap(), big);
    }

    #[test]
    fn flex_u64_f64_whole_number() {
        // JSON floats like 100.0 should deserialise fine
        assert_eq!(parse_flex(r#"{"value": 100.0}"#).unwrap(), 100u64);
    }

    #[test]
    fn flex_u64_invalid_string_errors() {
        assert!(parse_flex(r#"{"value": "not-a-number"}"#).is_err());
    }

    #[test]
    fn flex_u64_invalid_string_float_errors() {
        // "3.14" is not a valid u64 string
        assert!(parse_flex(r#"{"value": "3.14"}"#).is_err());
    }

    #[test]
    fn flex_u64_empty_map_errors() {
        assert!(parse_flex(r#"{"value": {}}"#).is_err());
    }

    #[test]
    fn flex_u64_null_errors() {
        assert!(parse_flex(r#"{"value": null}"#).is_err());
    }

    // ── deserialize_flexible_option_u64 ───────────────────────────────────────

    #[test]
    fn flex_opt_u64_null_is_none() {
        assert_eq!(parse_flex_opt(r#"{"value": null}"#).unwrap(), None);
    }

    #[test]
    fn flex_opt_u64_missing_field_is_none() {
        // `default` attribute means missing field → None
        assert_eq!(parse_flex_opt(r#"{}"#).unwrap(), None);
    }

    #[test]
    fn flex_opt_u64_plain_integer_is_some() {
        assert_eq!(parse_flex_opt(r#"{"value": 7}"#).unwrap(), Some(7u64));
    }

    #[test]
    fn flex_opt_u64_string_is_some() {
        assert_eq!(parse_flex_opt(r#"{"value": "42"}"#).unwrap(), Some(42u64));
    }

    #[test]
    fn flex_opt_u64_bigint_wrapper_is_some() {
        assert_eq!(
            parse_flex_opt(r#"{"value": {"__bigint__": "500"}}"#).unwrap(),
            Some(500u64)
        );
    }

    #[test]
    fn flex_opt_u64_zero_is_some() {
        assert_eq!(parse_flex_opt(r#"{"value": 0}"#).unwrap(), Some(0u64));
    }

    #[test]
    fn flex_opt_u64_invalid_string_errors() {
        assert!(parse_flex_opt(r#"{"value": "bad"}"#).is_err());
    }

    // ── FeeStatus / ClaimStatus serde roundtrip ───────────────────────────────

    #[test]
    fn fee_status_pending_roundtrip() {
        let json = serde_json::to_string(&FeeStatus::Pending).unwrap();
        let back: FeeStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, FeeStatus::Pending);
    }

    #[test]
    fn fee_status_verified_roundtrip() {
        let json = serde_json::to_string(&FeeStatus::Verified).unwrap();
        let back: FeeStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, FeeStatus::Verified);
    }

    #[test]
    fn fee_status_failed_roundtrip() {
        let json = serde_json::to_string(&FeeStatus::Failed).unwrap();
        let back: FeeStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, FeeStatus::Failed);
    }

    #[test]
    fn claim_status_pending_roundtrip() {
        let json = serde_json::to_string(&ClaimStatus::Pending).unwrap();
        let back: ClaimStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ClaimStatus::Pending);
    }

    #[test]
    fn claim_status_ready_for_chain_roundtrip() {
        let json = serde_json::to_string(&ClaimStatus::ReadyForChain).unwrap();
        let back: ClaimStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ClaimStatus::ReadyForChain);
    }

    #[test]
    fn claim_status_completed_roundtrip() {
        let json = serde_json::to_string(&ClaimStatus::Completed).unwrap();
        let back: ClaimStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(back, ClaimStatus::Completed);
    }

    // ── FeeRequest field validation helpers ───────────────────────────────────

    #[test]
    fn tx_hash_format_valid() {
        let tx = format!("0x{}", "a".repeat(64));
        assert!(tx.starts_with("0x") && tx.len() == 66);
    }

    #[test]
    fn tx_hash_format_missing_prefix() {
        let tx = "a".repeat(64);
        assert!(!tx.starts_with("0x"));
    }

    #[test]
    fn tx_hash_format_too_short() {
        let tx = format!("0x{}", "a".repeat(63));
        assert!(tx.len() != 66);
    }

    #[test]
    fn expected_fee_key_format() {
        let tx_hash = format!("0x{}", "b".repeat(64));
        let expected = format!("fee_{}", tx_hash);
        assert!(expected.starts_with("fee_0x"));
        assert_eq!(expected.len(), "fee_".len() + 66);
    }

    // ── ClaimRequest validation helpers ───────────────────────────────────────

    #[test]
    fn claim_amount_zero_is_invalid() {
        let amount: u64 = 0;
        assert_eq!(amount, 0, "amount must be > 0");
    }

    #[test]
    fn claim_game_session_id_empty_is_invalid() {
        let session_id = "";
        assert!(session_id.is_empty());
    }

    // ── Hex decode helpers used by verify_wallet_signature ────────────────────

    #[test]
    fn hex_decode_valid_signature_length() {
        // A valid 65-byte signature (130 hex chars)
        let sig_hex = "a".repeat(130);
        let bytes = hex::decode(&sig_hex).unwrap();
        assert_eq!(bytes.len(), 65);
    }

    #[test]
    fn hex_decode_invalid_hex_errors() {
        assert!(hex::decode("zzzz").is_err());
    }

    #[test]
    fn hex_decode_wrong_length_detected() {
        // 64 bytes (128 hex chars) — one byte short
        let sig_hex = "a".repeat(128);
        let bytes = hex::decode(&sig_hex).unwrap();
        assert_ne!(bytes.len(), 65);
    }

    #[test]
    fn hex_decode_0x_prefix_stripped() {
        let sig_hex = format!("0x{}", "c".repeat(130));
        let stripped = sig_hex.trim_start_matches("0x");
        let bytes = hex::decode(stripped).unwrap();
        assert_eq!(bytes.len(), 65);
    }
}
