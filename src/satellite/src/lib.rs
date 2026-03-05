//! Tresr Game - Juno Serverless Functions
#![allow(deprecated)]
//!
//! This module implements hook-based serverless functions for the Tresr game.
//! It uses Juno's event-driven architecture where hooks respond to Datastore operations.
//!
//! Collections:
//! - `users`: User profiles with wallet linking and game stats
//! - `fees`: Fee requests for EVM transaction verification
//! - `claims`: Reward claim requests
//! - `stats`: Aggregate burn/payout statistics
//!
//! HTTP Endpoints:
//! - `game_sessions`: Game session data for anti-cheat validation
//! - `balance_refresh`: Requests to sync balance from on-chain

mod evm_rpc;
mod evm_rpc_types;
mod logging;
mod types;

/// Build-time generated constants from config/tresr.yaml (see build.rs).
#[allow(dead_code)]
mod config {
    include!(concat!(env!("OUT_DIR"), "/generated_config.rs"));
}

use ic_cdk::api::time;
use ic_cdk::update;
use junobuild_macros::{
    assert_delete_doc, assert_set_doc, on_delete_asset, on_delete_doc, on_delete_many_assets,
    on_delete_many_docs, on_set_doc, on_set_many_docs, on_upload_asset,
};
#[allow(clippy::single_component_path_imports)]
use junobuild_satellite::{
    AssertDeleteDocContext, AssertSetDocContext, DelDoc, OnDeleteAssetContext, OnDeleteDocContext,
    OnDeleteManyAssetsContext, OnDeleteManyDocsContext, OnSetDocContext, OnSetManyDocsContext,
    OnUploadAssetContext, SetDoc, delete_doc_store, get_doc_store, include_satellite,
    list_docs_store, set_doc_store,
};
use junobuild_shared::types::list::ListParams;
use junobuild_utils::{decode_doc_data, encode_doc_data};
use libsecp256k1::{Message, RecoveryId, Signature, recover};
use tiny_keccak::{Hasher, Keccak};

use std::cell::RefCell;

use types::{
    BalanceRefreshRequest, ClaimRequest, ClaimStatus, ErrorPayload, ErrorRecord, FeeRequest,
    FeeStatus, GameSession, GlobalStats, LeaderboardEntry, RefreshStatus, UserProfile,
};

/// Cached top active scorer to avoid full leaderboard scans on every session completion.
/// Populated lazily on first call from a persisted datastore document, and updated
/// (with write-through) when new higher scores are written.
///
/// Previously this used a full `list_docs_store` scan on cold start which exceeded
/// the 40B instruction limit (IC0522) as the leaderboard grew.
#[derive(Clone)]
struct TopScorerCache {
    key: String,
    score: u64,
    scored_at: u64,
    _expires_at: u64,
    owner: candid::Principal,
}

/// Serializable version of TopScorerCache for datastore persistence.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "snake_case")]
struct TopScorerCacheDoc {
    key: String,
    score: u64,
    scored_at: u64,
    expires_at: u64,
    /// Principal stored as text for JSON serialization
    owner_principal: String,
}

/// Three-state cache for the top active scorer.
#[derive(Clone)]
enum TopScorerState {
    /// Cold start — cache not yet loaded from datastore
    Cold,
    /// Cache loaded, but no active top scorer exists
    Empty,
    /// Cached active top scorer
    Active(TopScorerCache),
}

thread_local! {
    static TOP_SCORER: RefCell<TopScorerState> = const { RefCell::new(TopScorerState::Cold) };
}

// =============================================================================
// Assertion - Validate operations BEFORE they are executed
// =============================================================================

/// Single assertion handler for all collections
/// Juno only allows one #[assert_set_doc] per module, so we dispatch by collection name
#[assert_set_doc(collections = ["users", "audit", "balance_refresh"])]
fn assert_set_doc(context: AssertSetDocContext) -> Result<(), String> {
    match context.data.collection.as_str() {
        "users" => assert_user_profile(&context).map_err(|e| {
            crate::logging::log_error("Users", &e);
            e
        }),
        "audit" => {
            if context.data.key.starts_with("fee_") {
                assert_fee_request(&context).map_err(|e| {
                    crate::logging::log_error("Fees", &e);
                    e
                })
            } else if context.data.key.starts_with("claim_") {
                assert_claim_request(&context).map_err(|e| {
                    crate::logging::log_error("Claims", &e);
                    e
                })
            } else if context.data.key.starts_with("session_") {
                assert_game_session(&context).map_err(|e| {
                    crate::logging::log_error("GameSessions", &e);
                    e
                })
            } else {
                Err("Invalid audit key prefix".to_string())
            }
        }
        "balance_refresh" => Ok(()), // No validation needed for refresh requests
        _ => Ok(()),
    }
}

/// Validate user profile updates
fn assert_user_profile(context: &AssertSetDocContext) -> Result<(), String> {
    let data: UserProfile = decode_doc_data(&context.data.data.proposed.data)?;

    // Validate EVM wallet format if provided
    if let Some(ref wallet) = data.evm_wallet {
        if !wallet.is_empty() {
            if !wallet.starts_with("0x") || wallet.len() != 42 {
                return Err(
                    "Invalid EVM wallet address format. Must be 0x followed by 40 hex characters."
                        .to_string(),
                );
            }

            // Read the current document to check if the wallet is actually changing
            let current_wallet = get_doc_store(
                context.caller,
                "users".to_string(),
                context.data.key.clone(),
            )
            .ok()
            .flatten()
            .and_then(|doc| decode_doc_data::<UserProfile>(&doc.data).ok())
            .and_then(|p| p.evm_wallet);

            let wallet_is_changing = current_wallet.as_deref() != Some(wallet.as_str());

            if wallet_is_changing {
                // SIWA (Sign In With Avalanche) users already proved wallet ownership
                // at the IC network level via the ic-siwa canister — the SIWA signature
                // cryptographically binds the wallet address to the caller's principal.
                // Requiring a second wallet-link signature is redundant and hurts UX.
                //
                // For IID (Internet Identity) users who manually link a wallet, we still
                // require the wallet-link signature since IID auth doesn't involve a wallet.
                let is_siwa = data.login_method.as_deref() == Some("siwa");

                if !is_siwa {
                    // Require verification only for non-SIWA wallet linking (ticket #189)
                    let sig = data.verification_signature.as_deref().ok_or(
                        "verification_signature is required when linking an EVM wallet".to_string(),
                    )?;
                    let msg = data.verification_message.as_deref().ok_or(
                        "verification_message is required when linking an EVM wallet".to_string(),
                    )?;

                    // The document key in the "users" collection is the caller's principal
                    let caller_principal = &context.data.key;

                    verify_wallet_signature(wallet, msg, sig, caller_principal)?;
                }
            }
        }
    }

    Ok(())
}

/// Maximum age of a wallet-link message signature (5 minutes)
const WALLET_LINK_MAX_AGE_SECS: u64 = 300;

/// Domain separator that must appear as the first line of every wallet-link message.
const WALLET_LINK_DOMAIN: &str = "TRESR Wallet Link";

fn verify_wallet_signature(
    address: &str,
    message: &str,
    signature_hex: &str,
    caller_principal: &str,
) -> Result<(), String> {
    // ── 0. Validate message content (ticket #189) ────────────────────────
    validate_wallet_link_message(message, caller_principal, address)?;

    // ── 1. Decode hex signature ──────────────────────────────────────────
    let sig_hex = signature_hex.trim_start_matches("0x");
    let sig_bytes = hex::decode(sig_hex).map_err(|_| "Invalid signature format")?;

    if sig_bytes.len() != 65 {
        return Err("Invalid signature length".to_string());
    }

    let recid_byte = sig_bytes[64];
    let recid = if recid_byte >= 27 {
        RecoveryId::parse(recid_byte - 27)
    } else {
        RecoveryId::parse(recid_byte)
    }
    .map_err(|_| "Invalid recovery ID")?;

    let signature = Signature::parse_standard_slice(&sig_bytes[0..64])
        .map_err(|_| "Invalid signature bytes")?;

    // ── 2. Hash message (EIP-191 personal_sign) ──────────────────────────
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut keccak = Keccak::v256();
    keccak.update(prefix.as_bytes());
    keccak.update(message.as_bytes());
    let mut hash = [0u8; 32];
    keccak.finalize(&mut hash);

    let message_struct = Message::parse(&hash);

    // ── 3. Recover public key ────────────────────────────────────────────
    let pubkey =
        recover(&message_struct, &signature, &recid).map_err(|_| "Failed to recover public key")?;

    // ── 4. Derive address ────────────────────────────────────────────────
    let mut pubkey_hash = [0u8; 32];
    let mut pubkey_keccak = Keccak::v256();
    pubkey_keccak.update(&pubkey.serialize()[1..65]);
    pubkey_keccak.finalize(&mut pubkey_hash);

    let recovered_address = hex::encode(&pubkey_hash[12..32]);

    // ── 5. Compare recovered address with claimed address ────────────────
    if address.trim_start_matches("0x").to_lowercase() != recovered_address {
        return Err("Signature does not match address".to_string());
    }

    Ok(())
}

/// Parse and validate the structured wallet-link message.
///
/// Expected format (newline-separated):
/// ```text
/// TRESR Wallet Link
/// Domain: {origin}
/// Principal: {principal}
/// Wallet: {address}
/// Timestamp: {unix_secs}
/// Nonce: {uuid}
/// ```
fn validate_wallet_link_message(
    message: &str,
    expected_principal: &str,
    expected_address: &str,
) -> Result<(), String> {
    let lines: Vec<&str> = message.lines().collect();

    if lines.len() < 6 {
        return Err("Wallet link message has fewer than 6 lines".to_string());
    }

    // Line 0: domain separator
    if lines[0] != WALLET_LINK_DOMAIN {
        return Err(format!(
            "Invalid domain separator: expected '{}'",
            WALLET_LINK_DOMAIN
        ));
    }

    // Line 1: origin domain binding
    let msg_domain = lines[1]
        .strip_prefix("Domain: ")
        .ok_or("Missing 'Domain:' field in wallet link message")?;
    if !config::ALLOWED_ORIGINS.contains(&msg_domain) {
        return Err(format!(
            "Origin '{}' is not in the allowed origins list",
            msg_domain
        ));
    }

    // Line 2: principal binding
    let msg_principal = lines[2]
        .strip_prefix("Principal: ")
        .ok_or("Missing 'Principal:' field in wallet link message")?;
    if msg_principal != expected_principal {
        return Err("Principal in message does not match caller".to_string());
    }

    // Line 3: wallet address binding
    let msg_wallet = lines[3]
        .strip_prefix("Wallet: ")
        .ok_or("Missing 'Wallet:' field in wallet link message")?;
    if msg_wallet.to_lowercase() != expected_address.to_lowercase() {
        return Err("Wallet address in message does not match claimed address".to_string());
    }

    // Line 4: timestamp freshness
    let ts_str = lines[4]
        .strip_prefix("Timestamp: ")
        .ok_or("Missing 'Timestamp:' field in wallet link message")?;
    let ts: u64 = ts_str
        .parse()
        .map_err(|_| "Invalid timestamp in wallet link message")?;

    let now_ns = ic_cdk::api::time(); // nanoseconds
    let now_secs = now_ns / 1_000_000_000;

    if ts > now_secs + 60 {
        // allow 60 s clock skew into the future
        return Err("Wallet link message timestamp is in the future".to_string());
    }
    if now_secs.saturating_sub(ts) > WALLET_LINK_MAX_AGE_SECS {
        return Err("Wallet link message has expired (>5 minutes old)".to_string());
    }

    // Line 5: nonce (format check only — not stored server-side)
    if !lines[5].starts_with("Nonce: ") {
        return Err("Missing 'Nonce:' field in wallet link message".to_string());
    }

    Ok(())
}

/// Validate fee requests
fn assert_fee_request(context: &AssertSetDocContext) -> Result<(), String> {
    let data: FeeRequest = decode_doc_data(&context.data.data.proposed.data)?;

    // Validate transaction hash format
    if !data.tx_hash.starts_with("0x") || data.tx_hash.len() != 66 {
        return Err(
            "Invalid transaction hash format. Must be 0x followed by 64 hex characters."
                .to_string(),
        );
    }

    // Enforce document key == "fee_" + tx_hash to prevent fee replay (ticket #288).
    // Juno enforces key uniqueness per user, so the same tx_hash cannot be
    // submitted twice under different keys. Combined with tx.from validation
    // (ticket #285), this prevents any user from replaying another's fee.
    let expected_key = format!("fee_{}", data.tx_hash);
    if context.data.key != expected_key {
        return Err("Fee document key must equal 'fee_' + transaction hash.".to_string());
    }

    // Only enforce Pending status on *creation* (no existing document).
    // The backend timer writes Verified/Failed via set_doc_store — that also
    // fires assert_set_doc, so we must allow those updates through.
    // A pre-existing document means this is a backend update, not a user write.
    let is_new_doc = get_doc_store(
        context.caller,
        "audit".to_string(),
        context.data.key.clone(),
    )
    .ok()
    .flatten()
    .is_none();

    if is_new_doc && data.status != FeeStatus::Pending {
        return Err("Fees must be created with 'pending' status.".to_string());
    }

    Ok(())
}

/// Validate claim requests
fn assert_claim_request(context: &AssertSetDocContext) -> Result<(), String> {
    let data: ClaimRequest = decode_doc_data(&context.data.data.proposed.data)?;

    // Ensure game session is linked
    if data.game_session_id.is_empty() {
        return Err("Claim must be linked to a game session.".to_string());
    }

    // Allow pending or ready_for_chain status
    if data.status != ClaimStatus::Pending && data.status != ClaimStatus::ReadyForChain {
        return Err(
            "Claims must be created with 'pending' or 'ready_for_chain' status.".to_string(),
        );
    }

    // Basic amount validation
    if data.amount == 0 {
        return Err("Claim amount must be greater than zero.".to_string());
    }

    Ok(())
}

/// Validate game session data
fn assert_game_session(context: &AssertSetDocContext) -> Result<(), String> {
    let data: GameSession = decode_doc_data(&context.data.data.proposed.data)?;

    // Ensure started_at is set
    if data.started_at == 0 {
        return Err("Game session must have a start time.".to_string());
    }

    // Basic anti-cheat: keys collected should be reasonable
    if data.keys_collected > config::MAX_KEYS_COLLECTED {
        return Err("Invalid keys collected count.".to_string());
    }

    Ok(())
}

/// Per-collection delete policy.
/// Allow deletion for ephemeral / user-managed data; block for financial audit trails.
#[assert_delete_doc(collections = ["users", "audit", "scores", "economy", "balance_refresh"])]
fn assert_delete_doc(context: AssertDeleteDocContext) -> Result<(), String> {
    match context.data.collection.as_str() {
        // Users: allow self-deletion (e.g. account removal)
        "users" => Ok(()),
        // Scores: allow removal of own expired entries
        "scores" => Ok(()),
        // Balance refresh: ephemeral, allow cleanup
        "balance_refresh" => Ok(()),
        // Financial / game session data — block to preserve audit trail
        "audit" | "economy" => {
            let msg = format!(
                "Deletion blocked for collection '{}' — audit trail must be preserved",
                context.data.collection
            );
            crate::logging::log_error("Security", &msg);
            Err(msg)
        }
        _ => Ok(()),
    }
}

// =============================================================================
// Hook - Process operations AFTER they are executed
// =============================================================================

/// Single hook handler for all collections
/// Juno only allows one #[on_set_doc] per module, so we dispatch by collection name
#[on_set_doc(collections = ["users", "audit", "balance_refresh"])]
async fn on_set_doc(context: OnSetDocContext) -> Result<(), String> {
    let ic_start = ic_cdk::api::instruction_counter();
    let collection = context.data.collection.clone();
    let key = context.data.key.clone();

    logging::log_info(
        "Hooks",
        &format!(
            "on_set_doc fired for collection='{}' key='{}'",
            collection, key
        ),
    );

    let result = match context.data.collection.as_str() {
        "audit" => {
            if context.data.key.starts_with("fee_") {
                on_fee_created(context).await
            } else if context.data.key.starts_with("claim_") {
                on_claim_created(context).await
            } else if context.data.key.starts_with("session_") {
                on_game_session_update(context).await
            } else {
                Ok(())
            }
        }
        "balance_refresh" => on_balance_refresh(context).await,
        "users" => on_user_profile_updated(context).await,
        _ => Ok(()),
    };

    let ic_used = ic_cdk::api::instruction_counter() - ic_start;
    logging::log_debug(
        "Perf",
        &format!(
            "on_set_doc '{}' key='{}': {} instructions ({:.2}% of 40B limit)",
            collection,
            key,
            ic_used,
            (ic_used as f64 / 40_000_000_000.0) * 100.0
        ),
    );

    result
}

/// Sync sanitized leaderboard entry when a user profile is saved.
/// Only writes public-safe data: nickname, highScore, gamesWon.
///
/// Guard: if the leaderboard-relevant fields haven't changed since the last
/// write, skip the write entirely. This prevents wasteful re-trigger cascades
/// when only the wallet balance or notifications are updated (e.g. from
/// `on_fee_created`).
async fn on_user_profile_updated(context: OnSetDocContext) -> Result<(), String> {
    let profile: UserProfile = decode_doc_data(&context.data.data.after.data)?;

    // Only create scores entries for users who have played at least once
    if profile.stats.high_score == 0 {
        return Ok(());
    }

    // Preserve existing active score fields from the scores entry
    let existing_doc = get_doc_store(
        context.caller,
        "scores".to_string(),
        context.data.key.clone(),
    )
    .ok()
    .flatten();

    let existing_version = existing_doc.as_ref().and_then(|d| d.version);
    let existing = existing_doc.and_then(|doc| decode_doc_data::<LeaderboardEntry>(&doc.data).ok());

    // --- Re-trigger guard ---
    // If scores already has exactly the same user-derived fields,
    // skip the write to avoid a set_doc → on_set_doc → set_doc loop.
    if let Some(ref ex) = existing {
        if ex.nickname == profile.nickname
            && ex.avatar_url == profile.preferences.avatar_url
            && ex.high_score == profile.stats.high_score
            && ex.games_won == profile.stats.total_games_won
        {
            logging::log_debug(
                "Scores",
                &format!(
                    "Skipping scores sync — no user-field changes for {}",
                    context.data.key
                ),
            );
            return Ok(());
        }
    }

    let entry = LeaderboardEntry {
        nickname: profile.nickname.clone(),
        avatar_url: profile.preferences.avatar_url.clone(),
        high_score: profile.stats.high_score,
        games_won: profile.stats.total_games_won,
        active_score: existing.as_ref().map_or(0, |e| e.active_score),
        scored_at: existing.as_ref().and_then(|e| e.scored_at),
        expires_at: existing.as_ref().and_then(|e| e.expires_at),
        session_id: existing.as_ref().and_then(|e| e.session_id.clone()),
    };

    let scores_doc = SetDoc {
        data: encode_doc_data(&entry)?,
        description: Some("Leaderboard entry".to_string()),
        version: existing_version,
    };

    set_doc_store(
        context.caller,
        "scores".to_string(),
        context.data.key.clone(),
        scores_doc,
    )?;

    logging::log_info(
        "Scores",
        &format!(
            "[Scores] Updated collection scores for user {} with score={}, nickname={}",
            context.data.key, profile.stats.high_score, profile.nickname
        ),
    );

    Ok(())
}

/// Process fee requests - verify on EVM chain
async fn on_fee_created(context: OnSetDocContext) -> Result<(), String> {
    let mut fee: FeeRequest = decode_doc_data(&context.data.data.after.data)?;

    // Only process pending fees
    if fee.status != FeeStatus::Pending {
        return Ok(());
    }

    // Verify the transaction on Avalanche
    // Pass the caller's wallet so the ANVIL mock can echo it back and pass the from-check.
    let caller_wallet_for_mock = if crate::config::NETWORK_NAME == "anvil" {
        // Pre-fetch caller wallet only for the mock path to avoid an extra read on mainnet.
        let user_key = context.caller.to_text();
        get_doc_store(context.caller, "users".to_string(), user_key)
            .ok()
            .flatten()
            .and_then(|doc| decode_doc_data::<UserProfile>(&doc.data).ok())
            .and_then(|p| p.evm_wallet)
    } else {
        None
    };
    match evm_rpc::verify_avalanche_fee(&fee.tx_hash, caller_wallet_for_mock.as_deref()).await {
        Ok(parsed) => {
            // Validate tx.from matches the caller's linked EVM wallet (ticket #285)
            let user_key = context.caller.to_text();
            let user_doc = get_doc_store(context.caller, "users".to_string(), user_key.clone())?;
            if user_doc.is_none() {
                fee.status = FeeStatus::Failed;
                fee.error = Some("User profile not found — cannot credit deposit".to_string());
                let updated_doc = SetDoc {
                    data: encode_doc_data(&fee)?,
                    description: context.data.data.after.description.clone(),
                    version: context.data.data.after.version,
                };
                set_doc_store(
                    context.caller,
                    context.data.collection.clone(),
                    context.data.key.clone(),
                    updated_doc,
                )?;
                logging::log_error(
                    "Fees",
                    &format!("Fee rejected: no profile for {}", user_key),
                );
                return Ok(());
            }
            if let Some(ref user_doc_inner) = user_doc {
                let user_profile_check: UserProfile = decode_doc_data(&user_doc_inner.data)?;
                let caller_wallet = match &user_profile_check.evm_wallet {
                    Some(w) if !w.is_empty() => w.clone(),
                    _ => {
                        fee.status = FeeStatus::Failed;
                        fee.error = Some("No linked EVM wallet to verify fee sender".to_string());
                        let updated_doc = SetDoc {
                            data: encode_doc_data(&fee)?,
                            description: context.data.data.after.description.clone(),
                            version: context.data.data.after.version,
                        };
                        set_doc_store(
                            context.caller,
                            context.data.collection.clone(),
                            context.data.key.clone(),
                            updated_doc,
                        )?;
                        return Ok(());
                    }
                };
                if !parsed.from.eq_ignore_ascii_case(&caller_wallet) {
                    fee.status = FeeStatus::Failed;
                    fee.error = Some(format!(
                        "Fee tx sender {} does not match caller wallet {}",
                        parsed.from, caller_wallet
                    ));
                    let updated_doc = SetDoc {
                        data: encode_doc_data(&fee)?,
                        description: context.data.data.after.description.clone(),
                        version: context.data.data.after.version,
                    };
                    set_doc_store(
                        context.caller,
                        context.data.collection.clone(),
                        context.data.key.clone(),
                        updated_doc,
                    )?;
                    logging::log_error(
                        "Fees",
                        &format!(
                            "Fee rejected: tx.from {} != caller wallet {}",
                            parsed.from, caller_wallet
                        ),
                    );
                    return Ok(());
                }
            }

            let verified_amount = parsed.amount;

            // Update fee status
            fee.status = FeeStatus::Verified;
            fee.amount = verified_amount;
            fee.verified_at = Some(time() / 1_000_000); // Convert ns to ms

            // Save updated fee
            let updated_doc = SetDoc {
                data: encode_doc_data(&fee)?,
                description: context.data.data.after.description.clone(),
                version: context.data.data.after.version,
            };

            set_doc_store(
                context.caller,
                context.data.collection.clone(),
                context.data.key.clone(),
                updated_doc,
            )?;

            // Credit verified fee to user's wallet balance.
            // Re-read the user doc to get the latest version — the frontend may
            // have written a newer version during the async EVM RPC verification
            // (the original read at line 489 can be seconds stale by now).
            let fresh_user_doc =
                get_doc_store(context.caller, "users".to_string(), user_key.clone())?;
            if let Some(fresh_doc) = fresh_user_doc {
                let mut user_profile: UserProfile = decode_doc_data(&fresh_doc.data)?;
                user_profile.wallet.balance = user_profile
                    .wallet
                    .balance
                    .checked_add(verified_amount)
                    .ok_or("Balance overflow on deposit credit")?;
                let updated_user = SetDoc {
                    data: encode_doc_data(&user_profile)?,
                    description: fresh_doc.description.clone(),
                    version: fresh_doc.version,
                };
                set_doc_store(
                    context.caller,
                    "users".to_string(),
                    user_key.clone(),
                    updated_user,
                )?;
                logging::log_info(
                    "Fees",
                    &format!(
                        "Fee verified: {} tokens for user {}. New balance: {}",
                        verified_amount, user_key, user_profile.wallet.balance
                    ),
                );
            } else {
                logging::log_warn(
                    "Fees",
                    &format!(
                        "Fee verified but user profile not found for {}",
                        context.caller.to_text()
                    ),
                );
            }

            // Snapshot the full vault state after this fee — all 4 values from a
            // single pass so economy/blockchain is always a consistent point-in-time
            // view (mirrors blockchain-sync.ts multicall behaviour).
            sync_economy_snapshot().await;
        }
        Err(e) => {
            // Mark fee as failed
            fee.status = FeeStatus::Failed;
            fee.error = Some(e.clone());

            let updated_doc = SetDoc {
                data: encode_doc_data(&fee)?,
                description: context.data.data.after.description.clone(),
                version: context.data.data.after.version,
            };

            set_doc_store(
                context.caller,
                context.data.collection.clone(),
                context.data.key.clone(),
                updated_doc,
            )?;

            logging::log_error("Fees", &format!("Fee verification failed: {}", e));
        }
    }

    Ok(())
}

/// Read all 4 vault contract values in parallel and write a complete, consistent
/// snapshot to economy/blockchain.
///
/// This is the Rust counterpart to `blockchain-sync.ts` on the frontend — a single
/// function that captures the full vault state atomically so every field in
/// economy/blockchain reflects the same point in time.
///
/// Called after every fee payment and reward claim. Non-fatal: if the EVM RPC
/// fails the error is logged but does not abort the hook.
async fn sync_economy_snapshot() {
    let snapshot = match evm_rpc::get_vault_snapshot().await {
        Ok(s) => s,
        Err(e) => {
            logging::log_warn(
                "Economy",
                &format!(
                    "[Economy] get_vault_snapshot failed (cache not updated): {}",
                    e
                ),
            );
            return;
        }
    };

    let canister_id = ic_cdk::id();
    let key = "blockchain".to_string();

    // Read existing doc to preserve version for optimistic concurrency
    let existing_doc = get_doc_store(canister_id, "economy".to_string(), key.clone())
        .ok()
        .flatten();
    let existing_version = existing_doc.as_ref().and_then(|d| d.version);

    // Preserve any fields Rust tracks incrementally (total_collected)
    let mut stats = existing_doc
        .and_then(|doc| decode_doc_data::<GlobalStats>(&doc.data).ok())
        .unwrap_or_default();

    // Overwrite all on-chain sourced fields with fresh chain values
    stats.total_fees = snapshot.total_fees_collected;
    stats.total_rewarded = snapshot.total_rewards_paid;
    stats.total_burned = snapshot.total_burned;
    stats.total_vault = snapshot.vault_balance;
    // total_collected is kept from the existing doc — it's the Juno-tracked
    // running total of fees credited, complementing the on-chain totalFeesCollected.

    let doc = SetDoc {
        data: match encode_doc_data(&stats) {
            Ok(d) => d,
            Err(e) => {
                logging::log_error(
                    "Economy",
                    &format!("[Economy] encode snapshot failed: {}", e),
                );
                return;
            }
        },
        description: Some("Global burn/payout stats".to_string()),
        version: existing_version,
    };

    match set_doc_store(canister_id, "economy".to_string(), key, doc) {
        Ok(_) => logging::log_info(
            "Economy",
            &format!(
                "[Economy] Snapshot written: fees={} rewards={} burned={} vault={}",
                stats.total_fees, stats.total_rewarded, stats.total_burned, stats.total_vault
            ),
        ),
        Err(e) => logging::log_warn(
            "Economy",
            &format!("[Economy] Failed to write economy snapshot: {}", e),
        ),
    }
}

/// Generate ECDSA signature for claim authorization using IC threshold ECDSA.
///
/// The private key is managed by the IC subnet — it never exists in one place.
/// We call `sign_with_ecdsa()` to sign and then determine the Ethereum recovery
/// ID (v) by trying both options and matching against the canister's public key.
///
/// Must match Vault.sol verification:
/// ```solidity
/// bytes32 hash = keccak256(abi.encodePacked(sessionId, msg.sender, amount, keys));
/// bytes32 ethSignedHash = hash.toEthSignedMessageHash();
/// address signer = ethSignedHash.recover(signature);
/// ```
///
/// abi.encodePacked layout (116 bytes):
///   sessionId: bytes32 (32 bytes, raw)
///   address:   address (20 bytes, raw)
///   amount:    uint256 (32 bytes, big-endian)
///   keys:      uint256 (32 bytes, big-endian)
async fn generate_claim_signature(
    session_id: &str,
    user_address: &str,
    amount: u64,
    keys: u64,
) -> Result<String, String> {
    // --- abi.encodePacked(sessionId, msg.sender, amount, keys) ---

    // sessionId: decode 0x-prefixed hex to 32 raw bytes (bytes32)
    let session_hex = session_id.strip_prefix("0x").unwrap_or(session_id);
    let session_bytes =
        hex::decode(session_hex).map_err(|_| format!("Invalid sessionId hex: {}", session_id))?;
    if session_bytes.len() != 32 {
        return Err(format!(
            "sessionId must be 32 bytes, got {}",
            session_bytes.len()
        ));
    }

    // address: decode 0x-prefixed hex to 20 raw bytes
    let addr_hex = user_address.strip_prefix("0x").unwrap_or(user_address);
    let addr_bytes =
        hex::decode(addr_hex).map_err(|_| format!("Invalid address hex: {}", user_address))?;
    if addr_bytes.len() != 20 {
        return Err(format!(
            "address must be 20 bytes, got {}",
            addr_bytes.len()
        ));
    }

    // amount: u64 → 32-byte big-endian uint256
    let mut amount_bytes = [0u8; 32];
    amount_bytes[24..32].copy_from_slice(&amount.to_be_bytes());

    // keys: u64 → 32-byte big-endian uint256
    let mut keys_bytes = [0u8; 32];
    keys_bytes[24..32].copy_from_slice(&keys.to_be_bytes());

    // Pack: 32 + 20 + 32 + 32 = 116 bytes
    let mut packed = Vec::with_capacity(116);
    packed.extend_from_slice(&session_bytes);
    packed.extend_from_slice(&addr_bytes);
    packed.extend_from_slice(&amount_bytes);
    packed.extend_from_slice(&keys_bytes);

    // --- keccak256(packed) ---
    let mut hasher = Keccak::v256();
    hasher.update(&packed);
    let mut hash = [0u8; 32];
    hasher.finalize(&mut hash);

    // --- EIP-191: "\x19Ethereum Signed Message:\n32" + hash ---
    let prefix = b"\x19Ethereum Signed Message:\n32";
    let mut prefixed = Vec::with_capacity(28 + 32);
    prefixed.extend_from_slice(prefix);
    prefixed.extend_from_slice(&hash);

    let mut eth_signed_hash = [0u8; 32];
    let mut hasher2 = Keccak::v256();
    hasher2.update(&prefixed);
    hasher2.finalize(&mut eth_signed_hash);

    // --- Sign with IC threshold ECDSA (no private key in this canister) ---
    let sig_bytes = evm_rpc::sign_with_ecdsa(&eth_signed_hash).await?;
    if sig_bytes.len() != 64 {
        return Err(format!(
            "Expected 64-byte signature from IC, got {}",
            sig_bytes.len()
        ));
    }

    let r = &sig_bytes[0..32];
    let s = &sig_bytes[32..64];

    // --- Determine recovery ID (v) using shared helper (ticket #268) ---
    let recovery_id = evm_rpc::determine_recovery_id(&sig_bytes, &eth_signed_hash).await?;
    let v = 27 + recovery_id;

    // Build 65-byte Ethereum signature: r (32) + s (32) + v (1)
    let mut full_sig = [0u8; 65];
    full_sig[0..32].copy_from_slice(r);
    full_sig[32..64].copy_from_slice(s);
    full_sig[64] = v;

    Ok(format!("0x{}", hex::encode(full_sig)))
}

/// Process claim requests - generate signature or verify transaction
async fn on_claim_created(context: OnSetDocContext) -> Result<(), String> {
    let mut claim: ClaimRequest = decode_doc_data(&context.data.data.after.data)?;

    // Handle initial claim creation: generate signature
    if claim.status == ClaimStatus::Pending && claim.signature.is_none() {
        if claim.claim_type == "consolation" {
            // --- Consolation claim: skip game session validation ---
            let user_doc = get_doc_store(
                context.caller,
                "users".to_string(),
                context.caller.to_text(),
            )?;

            let user_profile: UserProfile = match user_doc {
                Some(doc) => decode_doc_data(&doc.data)?,
                None => {
                    return update_claim_error(context, &mut claim, "User profile not found").await;
                }
            };

            let wallet_addr = match &user_profile.evm_wallet {
                Some(w) if !w.is_empty() => w.clone(),
                _ => {
                    return update_claim_error(context, &mut claim, "No linked EVM wallet").await;
                }
            };

            // Generate signature for consolation claim (keys_collected = 0)
            let signature =
                generate_claim_signature(&claim.game_session_id, &wallet_addr, claim.amount, 0)
                    .await?;
            claim.signature = Some(signature);
            claim.status = ClaimStatus::ReadyForChain;

            update_claim_doc(&context, &claim).await?;

            logging::log_info(
                "Claims",
                &format!(
                    "Consolation claim signature generated for user {} amount {}",
                    context.caller.to_text(),
                    claim.amount
                ),
            );
        } else {
            // --- Boss kill claim: full game session validation ---
            // 1. Fetch Game Session
            let session_doc = get_doc_store(
                context.caller,
                "game_sessions".to_string(),
                claim.game_session_id.clone(),
            )?;

            let session: GameSession = match session_doc {
                Some(ref doc) => decode_doc_data(&doc.data)?,
                None => {
                    return update_claim_error(context, &mut claim, "Game session not found").await;
                }
            };

            // 2. Validate session
            if !session.boss_defeated {
                return update_claim_error(context, &mut claim, "Boss not defeated").await;
            }

            if session.reward_claimed {
                return update_claim_error(context, &mut claim, "Reward already claimed").await;
            }

            // 3. Fetch User Profile for EVM wallet
            let user_doc = get_doc_store(
                context.caller,
                "users".to_string(),
                context.caller.to_text(),
            )?;

            let user_profile: UserProfile = match user_doc {
                Some(doc) => decode_doc_data(&doc.data)?,
                None => {
                    return update_claim_error(context, &mut claim, "User profile not found").await;
                }
            };

            let wallet_addr = match &user_profile.evm_wallet {
                Some(w) if !w.is_empty() => w.clone(),
                _ => {
                    return update_claim_error(context, &mut claim, "No linked EVM wallet").await;
                }
            };

            // 4. Mark session as claimed BEFORE signature generation (ticket #188).
            // The Juno document version provides optimistic concurrency control:
            // if two concurrent claims both try to write reward_claimed=true, the
            // second set_doc_store will fail on version mismatch, preventing a
            // double-claim during the async ECDSA signing yield point.
            let sd = session_doc.as_ref().unwrap(); // Safe: matched Some above
            let session_description = sd
                .description
                .clone()
                .ok_or_else(|| "session description missing".to_string())?;
            let session_version = sd
                .version
                .ok_or_else(|| "session version missing".to_string())?;
            {
                let mut claimed_session = session.clone();
                claimed_session.reward_claimed = true;
                update_session_doc(
                    &context,
                    &claimed_session,
                    claim.game_session_id.clone(),
                    session_description.clone(),
                    session_version,
                )
                .await?;
            }

            // 5. Generate signature (include keys_collected for Vault.sol verification).
            // If signing fails, attempt a best-effort rollback of reward_claimed.
            claim.keys_collected = session.keys_collected;
            let signature = match generate_claim_signature(
                &claim.game_session_id,
                &wallet_addr,
                claim.amount,
                session.keys_collected,
            )
            .await
            {
                Ok(sig) => sig,
                Err(e) => {
                    // Best-effort rollback: re-read session and clear reward_claimed.
                    // If rollback fails, manual intervention is needed but the session
                    // is in a safe state (claimed=true with no signature issued).
                    if let Ok(Some(rollback_doc)) = get_doc_store(
                        context.caller,
                        "game_sessions".to_string(),
                        claim.game_session_id.clone(),
                    ) {
                        if let Ok(mut rb_session) =
                            decode_doc_data::<GameSession>(&rollback_doc.data)
                        {
                            rb_session.reward_claimed = false;
                            let rb_version = rollback_doc
                                .version
                                .unwrap_or(session_version.saturating_add(1));
                            let rb_desc = rollback_doc
                                .description
                                .unwrap_or(session_description.clone());
                            let _ = update_session_doc(
                                &context,
                                &rb_session,
                                claim.game_session_id.clone(),
                                rb_desc,
                                rb_version,
                            )
                            .await;
                        }
                    }
                    return update_claim_error(
                        context,
                        &mut claim,
                        &format!("Signature generation failed: {}", e),
                    )
                    .await;
                }
            };
            claim.signature = Some(signature);
            claim.status = ClaimStatus::ReadyForChain;

            update_claim_doc(&context, &claim).await?;

            logging::log_info(
                "Claims",
                &format!(
                    "Claim signature generated for user {} session {}",
                    context.caller.to_text(),
                    claim.game_session_id
                ),
            );
        }

    // Handle claim completion: verify transaction
    } else if claim.status == ClaimStatus::ReadyForChain && claim.tx_hash.is_some() {
        // Verify the claim transaction
        evm_rpc::verify_avalanche_claim_tx(
            claim.tx_hash.as_ref().unwrap(),
            &claim.game_session_id,
            claim.amount,
            claim.keys_collected,
        )
        .await?;
        claim.status = ClaimStatus::Completed;

        update_claim_doc(&context, &claim).await?;

        // Snapshot the full vault state after this claim — all 4 values in parallel
        sync_economy_snapshot().await;

        logging::log_info(
            "Claims",
            &format!(
                "Claim completed for user {} session {}",
                context.caller.to_text(),
                claim.game_session_id
            ),
        );
    } else {
        // Already processed or invalid state
        return Ok(());
    }

    Ok(())
}

async fn update_claim_error(
    context: OnSetDocContext,
    claim: &mut ClaimRequest,
    error: &str,
) -> Result<(), String> {
    claim.status = ClaimStatus::Failed;
    claim.error = Some(error.to_string());
    update_claim_doc(&context, claim).await
}

async fn update_claim_doc(context: &OnSetDocContext, claim: &ClaimRequest) -> Result<(), String> {
    let updated_doc = SetDoc {
        data: encode_doc_data(claim)?,
        description: context.data.data.after.description.clone(),
        version: context.data.data.after.version,
    };

    set_doc_store(
        context.caller,
        context.data.collection.clone(),
        context.data.key.clone(),
        updated_doc,
    )?;
    Ok(())
}

async fn update_session_doc(
    context: &OnSetDocContext,
    session: &GameSession,
    key: String,
    description: String,
    version: u64,
) -> Result<(), String> {
    let updated_doc = SetDoc {
        data: encode_doc_data(session)?,
        description: Some(description),
        version: Some(version),
    };

    set_doc_store(
        context.caller,
        "game_sessions".to_string(),
        key,
        updated_doc,
    )?;
    Ok(())
}

/// Process balance refresh requests
async fn on_balance_refresh(context: OnSetDocContext) -> Result<(), String> {
    let mut refresh: BalanceRefreshRequest = decode_doc_data(&context.data.data.after.data)?;

    // Only process pending refreshes
    if refresh.status != RefreshStatus::Pending {
        return Ok(());
    }

    // Query on-chain ERC-20 balance via EVM RPC
    match evm_rpc::get_token_balance(&refresh.evm_wallet).await {
        Ok(balance) => {
            refresh.status = RefreshStatus::Completed;
            refresh.balance = Some(balance);
        }
        Err(e) => {
            refresh.status = RefreshStatus::Failed;
            refresh.error = Some(e.clone());
            logging::log_error(
                "Balance",
                &format!(
                    "Balance refresh failed for wallet {}: {}",
                    refresh.evm_wallet, e
                ),
            );
        }
    }

    let updated_doc = SetDoc {
        data: encode_doc_data(&refresh)?,
        description: context.data.data.after.description.clone(),
        version: context.data.data.after.version,
    };

    set_doc_store(
        context.caller,
        context.data.collection.clone(),
        context.data.key.clone(),
        updated_doc,
    )?;

    if refresh.status == RefreshStatus::Completed {
        logging::log_info(
            "Balance",
            &format!(
                "Balance refresh completed for wallet {}: {} tokens",
                refresh.evm_wallet,
                refresh.balance.unwrap_or(0)
            ),
        );
    }

    Ok(())
}

/// Process game session updates: update leaderboard active score and resolve expired top scores.
async fn on_game_session_update(context: OnSetDocContext) -> Result<(), String> {
    logging::log_debug(
        "GameSession",
        &format!(
            "on_game_session_update: key='{}' data_len={}",
            context.data.key,
            context.data.data.after.data.len()
        ),
    );

    let session: GameSession = decode_doc_data(&context.data.data.after.data)?;

    logging::log_debug(
        "GameSession",
        &format!(
            "on_game_session_update: deserialized OK, ended_at={:?}, score={}",
            session.ended_at, session.score
        ),
    );

    // Only process completed sessions
    if session.ended_at.is_none() {
        return Ok(());
    }

    let caller_key = context.caller.to_text();
    let now_ms = time() / 1_000_000;

    // Read caller's user profile for nickname
    let user_doc = get_doc_store(context.caller, "users".to_string(), caller_key.clone())?;
    let (nickname, avatar_url) = match user_doc {
        Some(ref doc) => {
            let profile: UserProfile = decode_doc_data(&doc.data)?;
            (profile.nickname, profile.preferences.avatar_url)
        }
        None => ("Unknown".to_string(), None),
    };

    // Read existing scores entry (keep raw Doc for version)
    let existing_lb_doc =
        get_doc_store(context.caller, "scores".to_string(), caller_key.clone())?.map(|doc| doc);

    let existing_lb_version = existing_lb_doc.as_ref().and_then(|d| d.version);
    let existing =
        existing_lb_doc.and_then(|doc| decode_doc_data::<LeaderboardEntry>(&doc.data).ok());

    let prev_high = existing.as_ref().map_or(0, |e| e.high_score);
    let prev_won = existing.as_ref().map_or(0, |e| e.games_won);

    // Update scores entry with active score
    let entry = LeaderboardEntry {
        nickname,
        avatar_url,
        high_score: prev_high.max(session.score),
        games_won: if session.boss_defeated {
            prev_won + 1
        } else {
            prev_won
        },
        active_score: session.score,
        scored_at: Some(now_ms),
        expires_at: Some(now_ms + config::SCORE_TTL_HOURS * 3_600_000),
        session_id: Some(context.data.key.clone()),
    };

    let leaderboard_doc = SetDoc {
        data: encode_doc_data(&entry)?,
        description: Some("Leaderboard entry with active score".to_string()),
        version: existing_lb_version,
    };

    set_doc_store(
        context.caller,
        "scores".to_string(),
        caller_key.clone(),
        leaderboard_doc,
    )?;

    let new_expires = now_ms + config::SCORE_TTL_HOURS * 3_600_000;
    logging::log_info(
        "Scores",
        &format!(
            "[Scores] Updated collection scores for user {} with score={}, nickname={}, expires_at={}",
            caller_key, session.score, entry.nickname, new_expires
        ),
    );

    // Update the top scorer cache if this score beats the current top
    let new_cache = TopScorerCache {
        key: caller_key.clone(),
        score: session.score,
        scored_at: now_ms,
        _expires_at: new_expires,
        owner: context.caller,
    };
    let should_update = TOP_SCORER.with(|cell| {
        let cache = cell.borrow();
        match &*cache {
            TopScorerState::Cold => true,
            TopScorerState::Empty => true,
            TopScorerState::Active(c) => {
                session.score > c.score || (session.score == c.score && now_ms < c.scored_at)
            }
        }
    });
    if should_update {
        TOP_SCORER.with(|cell| *cell.borrow_mut() = TopScorerState::Active(new_cache.clone()));
        // Write-through to datastore for cold-start recovery
        persist_top_scorer_cache(&new_cache)?;
    }

    // Resolve any expired top scores (consolation prize)
    resolve_expired_top_score().await?;

    Ok(())
}

/// Check if the top active score has expired and award a consolation prize if so.
/// Uses a thread-local cache to avoid full leaderboard scans on every call.
/// On cold start, loads from a persisted datastore document (single read) instead
/// of scanning the entire leaderboard collection (IC0522 fix).
async fn resolve_expired_top_score() -> Result<(), String> {
    let now_ms = time() / 1_000_000;

    // Check or populate the cache
    let cached = TOP_SCORER.with(|cell| cell.borrow().clone());
    let cached = match cached {
        TopScorerState::Active(c) => c,
        TopScorerState::Empty => return Ok(()), // Cache loaded, no active top scorer
        TopScorerState::Cold => {
            // Cold start: load from persisted datastore document (O(1) read)
            let top = load_persisted_top_scorer()?;
            TOP_SCORER.with(|cell| {
                *cell.borrow_mut() = match &top {
                    Some(t) => TopScorerState::Active(t.clone()),
                    None => TopScorerState::Empty,
                };
            });
            match top {
                Some(t) => t,
                None => return Ok(()), // No persisted top scorer
            }
        }
    };

    let winner_key = cached.key;
    let winner_principal = cached.owner;

    // Fetch the actual scores doc to get the current entry
    let winner_doc = get_doc_store(winner_principal, "scores".to_string(), winner_key.clone())?;

    let winner_entry: LeaderboardEntry = match winner_doc {
        Some(ref doc) => decode_doc_data(&doc.data)?,
        None => {
            // Entry was deleted; clear cache and return
            TOP_SCORER.with(|cell| *cell.borrow_mut() = TopScorerState::Empty);
            clear_persisted_top_scorer_cache();
            return Ok(());
        }
    };

    // Verify the cached entry is still the top (check expiry field still matches)
    let actual_expires = winner_entry.expires_at.unwrap_or(0);
    if actual_expires == 0 || winner_entry.active_score == 0 {
        // Entry was already cleared; invalidate cache and return
        TOP_SCORER.with(|cell| *cell.borrow_mut() = TopScorerState::Empty);
        clear_persisted_top_scorer_cache();
        return Ok(());
    }

    if actual_expires >= now_ms {
        return Ok(()); // Not expired yet
    }

    // Check if winner is banned
    let winner_profile_doc =
        get_doc_store(winner_principal, "users".to_string(), winner_key.clone())?;

    let mut winner_profile: UserProfile = match winner_profile_doc {
        Some(ref doc) => decode_doc_data(&doc.data)?,
        None => return Ok(()), // No profile found
    };
    let winner_profile_version = winner_profile_doc.as_ref().and_then(|d| d.version);

    if check_ban(&winner_profile).is_err() {
        // Banned user — clear their expires_at and skip
        clear_leaderboard_expiry(&winner_key, &winner_entry, winner_principal)?;
        TOP_SCORER.with(|cell| *cell.borrow_mut() = TopScorerState::Empty);
        clear_persisted_top_scorer_cache();
        logging::log_warn(
            "Consolation",
            &format!("Skipped consolation for banned user {}", winner_key),
        );
        return Ok(());
    }

    // Require minimum games played before awarding consolation prize
    if winner_profile.stats.total_games_played < config::CONSOLATION_PRIZE_MIN_GAMES {
        clear_leaderboard_expiry(&winner_key, &winner_entry, winner_principal)?;
        logging::log_warn(
            "Consolation",
            &format!(
                "Skipped consolation for {}: only {} games played (min {})",
                winner_key,
                winner_profile.stats.total_games_played,
                config::CONSOLATION_PRIZE_MIN_GAMES
            ),
        );
        return Ok(());
    }

    // Calculate consolation amount (use fixed max for simplicity, avoiding expensive vault query)
    let consolation_amount = config::CONSOLATION_PRIZE_MAX;

    // Create consolation claim
    let claim_key = format!("consolation_{}_{}", winner_key, now_ms);
    let session_id = winner_entry.session_id.clone().unwrap_or_default();

    let claim = ClaimRequest {
        amount: consolation_amount,
        status: ClaimStatus::Pending,
        signature: None,
        tx_hash: None,
        game_session_id: session_id,
        keys_collected: 0,
        error: None,
        claim_type: "consolation".to_string(),
    };

    let claim_doc = SetDoc {
        data: encode_doc_data(&claim)?,
        description: Some("Consolation prize for expired #1 active score".to_string()),
        version: None,
    };

    set_doc_store(
        winner_principal,
        "claims".to_string(),
        claim_key.clone(),
        claim_doc,
    )?;

    // Clear winner's expires_at to prevent double-award
    clear_leaderboard_expiry(&winner_key, &winner_entry, winner_principal)?;

    // Add notification to winner's profile
    let notification = serde_json::json!({
        "key": format!("consolation_{}", now_ms),
        "data": {
            "type": "consolation_prize",
            "message": format!("You earned a {} TRESR consolation prize! Your #1 active score expired.", consolation_amount),
            "urgency": "urgent",
            "timestamp": now_ms,
        }
    });

    // Append to existing notifications array, capping at most recent entries (ticket #190).
    const MAX_NOTIFICATIONS: usize = 25;
    let notifications = match &winner_profile.notifications {
        Some(serde_json::Value::Array(arr)) => {
            let mut new_arr = arr.clone();
            new_arr.push(notification);
            // Keep only the most recent MAX_NOTIFICATIONS entries
            if new_arr.len() > MAX_NOTIFICATIONS {
                let start = new_arr.len() - MAX_NOTIFICATIONS;
                new_arr = new_arr.split_off(start);
            }
            serde_json::Value::Array(new_arr)
        }
        _ => serde_json::Value::Array(vec![notification]),
    };
    winner_profile.notifications = Some(notifications);

    let profile_doc = SetDoc {
        data: encode_doc_data(&winner_profile)?,
        description: Some("Consolation prize notification added".to_string()),
        version: winner_profile_version,
    };

    set_doc_store(
        winner_principal,
        "users".to_string(),
        winner_key.clone(),
        profile_doc,
    )?;

    // Invalidate cache so next call re-discovers the new top scorer
    TOP_SCORER.with(|cell| *cell.borrow_mut() = TopScorerState::Empty);
    clear_persisted_top_scorer_cache();

    logging::log_info(
        "Consolation",
        &format!(
            "Consolation prize of {} awarded to user {} (claim: {})",
            consolation_amount, winner_key, claim_key
        ),
    );

    Ok(())
}

/// Load the persisted top scorer cache from the datastore.
/// Returns None if no cache document exists (no one has scored yet).
/// This is an O(1) single-document read, replacing the previous O(N) full scan.
fn load_persisted_top_scorer() -> Result<Option<TopScorerCache>, String> {
    let canister_id = ic_cdk::id();
    let doc = get_doc_store(canister_id, "scores".to_string(), "top_scorer".to_string())
        .ok()
        .flatten();

    match doc {
        None => Ok(None),
        Some(doc) => {
            let cached: TopScorerCacheDoc = decode_doc_data(&doc.data)?;
            // A zeroed-out doc (from clear_persisted_top_scorer_cache) means "no top scorer"
            if cached.score == 0 && cached.key.is_empty() {
                return Ok(None);
            }
            let owner = candid::Principal::from_text(&cached.owner_principal)
                .map_err(|e| format!("Invalid principal in top scorer cache: {}", e))?;
            Ok(Some(TopScorerCache {
                key: cached.key,
                score: cached.score,
                scored_at: cached.scored_at,
                _expires_at: cached.expires_at,
                owner,
            }))
        }
    }
}

/// Persist the top scorer cache to the datastore for cold-start recovery.
/// Uses the `scores` collection with key `top_scorer`.
fn persist_top_scorer_cache(cache: &TopScorerCache) -> Result<(), String> {
    let canister_id = ic_cdk::id();

    let existing_version =
        get_doc_store(canister_id, "scores".to_string(), "top_scorer".to_string())
            .ok()
            .flatten()
            .and_then(|d| d.version);

    let cache_doc = TopScorerCacheDoc {
        key: cache.key.clone(),
        score: cache.score,
        scored_at: cache.scored_at,
        expires_at: cache._expires_at,
        owner_principal: cache.owner.to_text(),
    };

    let doc = SetDoc {
        data: encode_doc_data(&cache_doc)?,
        description: Some("Persisted top scorer cache".to_string()),
        version: existing_version,
    };

    set_doc_store(
        canister_id,
        "scores".to_string(),
        "top_scorer".to_string(),
        doc,
    )?;

    logging::log_info(
        "Scores",
        &format!(
            "[Scores] Updated collection scores (top_scorer cache) with key={}, score={}",
            cache.key, cache.score
        ),
    );
    Ok(())
}

/// Clear the persisted top scorer cache (e.g., after consolation prize awarded).
fn clear_persisted_top_scorer_cache() {
    // Write an empty/zeroed entry rather than deleting, to avoid needing delete_doc_store
    let canister_id = ic_cdk::id();
    let existing_version =
        get_doc_store(canister_id, "scores".to_string(), "top_scorer".to_string())
            .ok()
            .flatten()
            .and_then(|d| d.version);

    let empty = TopScorerCacheDoc {
        key: String::new(),
        score: 0,
        scored_at: 0,
        expires_at: 0,
        owner_principal: ic_cdk::id().to_text(),
    };

    let doc = SetDoc {
        data: encode_doc_data(&empty).unwrap_or_default(),
        description: Some("Top scorer cache cleared".to_string()),
        version: existing_version,
    };

    let _ = set_doc_store(
        canister_id,
        "scores".to_string(),
        "top_scorer".to_string(),
        doc,
    );
}

/// Clear the expires_at on a scores entry to prevent re-processing.
fn clear_leaderboard_expiry(
    key: &str,
    entry: &LeaderboardEntry,
    owner: candid::Principal,
) -> Result<(), String> {
    // Fetch existing doc version for optimistic concurrency
    let existing_version = get_doc_store(owner, "scores".to_string(), key.to_string())
        .ok()
        .flatten()
        .and_then(|d| d.version);

    let mut cleared = entry.clone();
    cleared.expires_at = None;

    let doc = SetDoc {
        data: encode_doc_data(&cleared)?,
        description: Some("Active score expired — cleared".to_string()),
        version: existing_version,
    };

    set_doc_store(owner, "scores".to_string(), key.to_string(), doc)?;

    Ok(())
}

// =============================================================================
// Required Juno hooks (must be implemented even if empty)
// =============================================================================

#[on_set_many_docs]
async fn on_set_many_docs(context: OnSetManyDocsContext) -> Result<(), String> {
    logging::log_debug(
        "Hooks",
        &format!("on_set_many_docs fired with {} docs", context.data.len()),
    );
    Ok(())
}

#[on_delete_doc]
async fn on_delete_doc(context: OnDeleteDocContext) -> Result<(), String> {
    logging::log_info(
        "Hooks",
        &format!(
            "on_delete_doc: collection='{}' key='{}'",
            context.data.collection, context.data.key
        ),
    );
    Ok(())
}

#[on_delete_many_docs]
async fn on_delete_many_docs(context: OnDeleteManyDocsContext) -> Result<(), String> {
    logging::log_debug(
        "Hooks",
        &format!("on_delete_many_docs fired with {} docs", context.data.len()),
    );
    Ok(())
}

#[on_upload_asset]
async fn on_upload_asset(_context: OnUploadAssetContext) -> Result<(), String> {
    logging::log_debug("Hooks", "on_upload_asset fired");
    Ok(())
}

#[on_delete_asset]
async fn on_delete_asset(_context: OnDeleteAssetContext) -> Result<(), String> {
    logging::log_info("Hooks", "on_delete_asset fired");
    Ok(())
}

#[on_delete_many_assets]
async fn on_delete_many_assets(context: OnDeleteManyAssetsContext) -> Result<(), String> {
    logging::log_debug(
        "Hooks",
        &format!(
            "on_delete_many_assets fired with {} assets",
            context.data.len()
        ),
    );
    Ok(())
}

// =============================================================================
// Anti-Cheat Ban System
// =============================================================================

// Ban config constants are generated from tresr.yaml — see config::BAN_DURATIONS_HOURS
// and config::PERMANENT_AFTER_OFFENCE.

/// Calculate ban duration in milliseconds for the given offence number (1-indexed).
fn ban_duration_ms(offence_count: u64) -> Option<u64> {
    if offence_count >= config::PERMANENT_AFTER_OFFENCE {
        None // Permanent ban — no expiry
    } else {
        let idx = (offence_count as usize).saturating_sub(1);
        let hours = config::BAN_DURATIONS_HOURS
            .get(idx)
            .copied()
            .unwrap_or(*config::BAN_DURATIONS_HOURS.last().unwrap_or(&168));
        Some(hours * 3_600_000) // hours → ms
    }
}

/// Check if a user is currently banned. Returns Err with reason if banned.
fn check_ban(profile: &UserProfile) -> Result<(), String> {
    if let Some(banned_until) = profile.banned_until {
        let now_ms = time() / 1_000_000; // IC time is nanoseconds → convert to ms
        if banned_until > now_ms {
            return Err(format!(
                "BANNED: You are banned until {}. Offence count: {}",
                banned_until, profile.offence_count
            ));
        }
        // Permanent ban: banned_until == u64::MAX
        if banned_until == u64::MAX {
            return Err(format!(
                "BANNED: You are permanently banned. Offence count: {}",
                profile.offence_count
            ));
        }
    }
    Ok(())
}

/// Apply a ban to a user profile. Increments offence count and sets banned_until.
fn apply_ban(profile: &mut UserProfile) {
    profile.offence_count += 1;
    let now_ms = time() / 1_000_000;
    match ban_duration_ms(profile.offence_count) {
        Some(duration) => {
            profile.banned_until = Some(now_ms + duration);
        }
        None => {
            profile.banned_until = Some(u64::MAX); // Permanent
        }
    }
}

// =============================================================================
// Oracle Functions
// =============================================================================

/// Authorize a claim with replay verification
#[update]
async fn claim_authorize(
    session_id: String,
    reported_keys: u64,
    fee_tx_hash: String,
    replay_inputs: Vec<u8>,
) -> Result<(u128, Vec<u8>), String> {
    let ic_start = ic_cdk::api::instruction_counter();
    let caller = ic_cdk::caller();
    let caller_text = caller.to_text();

    // 0. Fetch user profile and check ban status
    let user_doc = get_doc_store(caller, "users".to_string(), caller_text.clone())?;
    let mut user_profile: UserProfile = match user_doc {
        Some(ref doc) => decode_doc_data(&doc.data)?,
        None => {
            return Err("User profile not found".to_string());
        }
    };
    let user_doc_version = user_doc.as_ref().and_then(|d| d.version);

    // Reject if currently banned
    check_ban(&user_profile)?;

    // Get user's linked EVM wallet for fee sender validation
    let wallet_addr = match &user_profile.evm_wallet {
        Some(w) if !w.is_empty() => w.clone(),
        _ => return Err("No linked EVM wallet".to_string()),
    };

    // 1a. Validate config hash from replay payload (#41)
    let client_config_hash = extract_config_hash(&replay_inputs).map_err(|e| {
        logging::log_error(
            "AntiCheat",
            &format!(
                "Failed to parse replay payload for user {}: {}",
                caller_text, e
            ),
        );
        format!("Invalid replay payload: {}", e)
    })?;

    if client_config_hash != config::CONFIG_HASH {
        // Config tampered — apply ban
        apply_ban(&mut user_profile);
        let ban_doc = SetDoc {
            data: encode_doc_data(&user_profile)?,
            description: Some("Ban applied: config hash mismatch".to_string()),
            version: user_doc_version,
        };
        set_doc_store(caller, "users".to_string(), caller_text.clone(), ban_doc)?;

        logging::log_error(
            "AntiCheat",
            &format!(
                "CHEAT_DETECTED: config hash mismatch for user {}. Expected={}, got={}. Offence #{}, banned_until={:?}",
                caller_text,
                config::CONFIG_HASH,
                client_config_hash,
                user_profile.offence_count,
                user_profile.banned_until
            ),
        );

        return Err(format!(
            "CHEAT_DETECTED: Config hash mismatch. Offence #{}, banned_until={}",
            user_profile.offence_count,
            user_profile.banned_until.unwrap_or(0)
        ));
    }

    // 1b. Fetch session from Datastore
    let session_doc = get_doc_store(caller, "game_sessions".to_string(), session_id.clone())?;
    let session: GameSession = match session_doc {
        Some(ref doc) => decode_doc_data(&doc.data)?,
        None => return Err("Game session not found".to_string()),
    };

    if !session.boss_defeated {
        return Err("Boss not defeated".to_string());
    }
    if session.reward_claimed {
        return Err("Reward already claimed".to_string());
    }

    // 2. Verify fee transaction on-chain and get actual fee amount
    // Pass wallet_addr to the mock so the from-address check passes in local dev.
    let parsed_fee = evm_rpc::verify_avalanche_fee(&fee_tx_hash, Some(&wallet_addr)).await?;

    // Validate that the fee sender matches the caller's linked wallet
    if !parsed_fee.from.eq_ignore_ascii_case(&wallet_addr) {
        return Err(format!(
            "Fee sender {} does not match linked wallet {}",
            parsed_fee.from, wallet_addr
        ));
    }

    // Convert fee amount from tokens (u64) to wei (u128) for reward calculation
    let fee_amount: u128 = (parsed_fee.amount as u128) * 1_000_000_000_000_000_000u128;

    // 3. Query vault balance via EVM RPC
    let vault_balance_tokens =
        evm_rpc::get_token_balance(crate::config::VAULT_CONTRACT_ADDRESS).await?;
    let vault_balance: u128 = (vault_balance_tokens as u128) * 1_000_000_000_000_000_000u128;

    if vault_balance < 1_000_000_000_000_000_000u128 {
        return Err("Low pot".to_string());
    }

    // 4. Parse and plausibility-check the replay input log (#171 Phase 1)
    // Reported keys are still trusted; Phase 2 will derive them from the log.
    let actions = extract_action_log(&replay_inputs)?;
    replay_verify_plausibility(&actions)?;

    if reported_keys > config::MAX_KEYS_COLLECTED {
        // Cheat detected — apply ban
        apply_ban(&mut user_profile);
        let ban_doc = SetDoc {
            data: encode_doc_data(&user_profile)?,
            description: Some("Ban applied: score exceeds maximum".to_string()),
            version: user_doc_version,
        };
        set_doc_store(caller, "users".to_string(), caller_text.clone(), ban_doc)?;

        logging::log_error(
            "AntiCheat",
            &format!(
                "CHEAT_DETECTED: max keys exceeded for user {}. Offence #{}, banned_until={:?}",
                caller_text, user_profile.offence_count, user_profile.banned_until
            ),
        );

        return Err(format!(
            "CHEAT_DETECTED: Max {} keys. Offence #{}, banned_until={}",
            config::MAX_KEYS_COLLECTED,
            user_profile.offence_count,
            user_profile.banned_until.unwrap_or(0)
        ));
    }

    // 5. Calc amount — integer-only arithmetic (no f64 precision loss)
    // perf_mult = (reported_keys / MAX_KEYS) * 0.5
    // => max_perf = vault_balance * reported_keys * 50 / (MAX_KEYS * 100)
    let max_perf = vault_balance
        .checked_mul(reported_keys as u128)
        .and_then(|v| v.checked_mul(50))
        .map(|v| v / (config::MAX_KEYS_COLLECTED as u128 * 100))
        .unwrap_or(0)
        .min(vault_balance / 2);
    let guaranteed = fee_amount
        .checked_mul(11)
        .map(|v| v / 10)
        .unwrap_or(fee_amount);
    let amount = max_perf.max(guaranteed).min(vault_balance);

    if amount > u64::MAX as u128 {
        return Err("Claim amount exceeds u64 range".to_string());
    }

    // 6. Sign with IC threshold ECDSA
    let signature_hex = generate_claim_signature(
        &session_id,
        &wallet_addr,
        amount as u64,
        session.keys_collected,
    )
    .await?;

    // Convert hex signature to bytes for return
    let sig_clean = signature_hex.strip_prefix("0x").unwrap_or(&signature_hex);
    let signature_bytes =
        hex::decode(sig_clean).map_err(|e| format!("Failed to decode signature hex: {}", e))?;

    // Mark session as claimed to prevent double-claim race
    let mut claimed_session = session.clone();
    claimed_session.reward_claimed = true;
    let claimed_doc = SetDoc {
        data: encode_doc_data(&claimed_session)?,
        description: Some("claim_authorize: marked reward_claimed".to_string()),
        version: session_doc.as_ref().unwrap().version,
    };
    set_doc_store(
        caller,
        "game_sessions".to_string(),
        session_id.clone(),
        claimed_doc,
    )?;

    let ic_used = ic_cdk::api::instruction_counter() - ic_start;
    logging::log_debug(
        "Perf",
        &format!(
            "claim_authorize session='{}': {} instructions ({:.2}% of 40B limit)",
            session_id,
            ic_used,
            (ic_used as f64 / 40_000_000_000.0) * 100.0
        ),
    );

    Ok((amount, signature_bytes))
}

/// A single player action as recorded by the TypeScript Recorder class.
/// Mirrors `GameAction` in `src/lib/game/Recorder.ts`.
#[derive(serde::Deserialize)]
struct GameAction {
    /// Relative timestamp in milliseconds since session start.
    t: u64,
    /// Action identifier — one of the VALID_ACTIONS set in the TS Recorder.
    a: String,
}

/// Parse the JSON action log from the front of the binary replay payload (#171).
///
/// Payload format (same as `extract_config_hash`):
///   [4B input_len][JSON action log][64B config hash][4B seed_len][seed]
///
/// Returns the deserialized action list, or an error if the payload is malformed.
fn extract_action_log(payload: &[u8]) -> Result<Vec<GameAction>, String> {
    if payload.len() < 4 {
        return Err("Payload too short: missing input length".to_string());
    }
    let input_len = u32::from_be_bytes(
        payload[0..4]
            .try_into()
            .map_err(|_| "Failed to read input length")?,
    ) as usize;
    let json_end = 4 + input_len;
    if payload.len() < json_end {
        return Err(format!(
            "Payload too short for action log: need {} bytes, have {}",
            json_end,
            payload.len()
        ));
    }
    let json_bytes = &payload[4..json_end];
    let actions: Vec<GameAction> = serde_json::from_slice(json_bytes)
        .map_err(|e| format!("Invalid action log JSON: {}", e))?;
    Ok(actions)
}

/// Phase 1 plausibility checks — guards against automated submissions and obvious cheating (#171).
///
/// Checks:
/// 1. Action count ≤ REPLAY_MAX_ACTIONS (matches Recorder::MAX_ACTIONS).
/// 2. No two consecutive events < REPLAY_MIN_ACTION_GAP_MS apart (< 1 browser frame).
/// 3. Consecutive `attack` events not faster than REPLAY_MIN_ATTACK_GAP_MS.
/// 4. Last event timestamp ≤ TIME_LIMIT_MS + REPLAY_GRACE_MS.
///
/// Reported keys are still trusted in Phase 1 (physics replay is Phase 2).
fn replay_verify_plausibility(actions: &[GameAction]) -> Result<(), String> {
    // 1. Action count sanity
    if actions.len() as u64 > config::REPLAY_MAX_ACTIONS {
        return Err(format!(
            "CHEAT_DETECTED: action count {} exceeds cap {}",
            actions.len(),
            config::REPLAY_MAX_ACTIONS
        ));
    }

    let max_duration_ms = config::TIME_LIMIT_MS + config::REPLAY_GRACE_MS;
    let mut last_attack_t: Option<u64> = None;

    for i in 0..actions.len() {
        let action = &actions[i];

        // 4. Total duration — any action beyond max session window is suspicious
        if action.t > max_duration_ms {
            return Err(format!(
                "CHEAT_DETECTED: action timestamp {}ms exceeds max session duration {}ms",
                action.t, max_duration_ms
            ));
        }

        // 2. Minimum gap between consecutive actions (catch sub-frame injection)
        if i > 0 {
            let prev_t = actions[i - 1].t;
            if action.t < prev_t {
                return Err(format!(
                    "CHEAT_DETECTED: action timestamps not monotonic at index {} ({} < {})",
                    i, action.t, prev_t
                ));
            }
            let gap = action.t - prev_t;
            if gap < config::REPLAY_MIN_ACTION_GAP_MS {
                return Err(format!(
                    "CHEAT_DETECTED: actions at index {} and {} are {}ms apart (min {}ms)",
                    i - 1,
                    i,
                    gap,
                    config::REPLAY_MIN_ACTION_GAP_MS
                ));
            }
        }

        // 3. Attack rate limit
        if action.a == "attack" {
            if let Some(prev_attack_t) = last_attack_t {
                let gap = action.t.saturating_sub(prev_attack_t);
                if gap < config::REPLAY_MIN_ATTACK_GAP_MS {
                    return Err(format!(
                        "CHEAT_DETECTED: attack at {}ms is only {}ms after previous attack (min {}ms)",
                        action.t,
                        gap,
                        config::REPLAY_MIN_ATTACK_GAP_MS
                    ));
                }
            }
            last_attack_t = Some(action.t);
        }
    }

    Ok(())
}

/// Parse the binary replay payload to extract the config hash (#41).
///
/// Payload format (length-prefixed, built by MainScene):
///   [4 bytes input length (big-endian)][inputs][configHash (64 UTF-8 bytes)][4 bytes seed length][seed]
///
/// Returns the config hash as a UTF-8 string, or an error if the payload is malformed.
fn extract_config_hash(payload: &[u8]) -> Result<String, String> {
    // Need at least 4 bytes for input length prefix
    if payload.len() < 4 {
        return Err("Payload too short: missing input length".to_string());
    }

    let input_len = u32::from_be_bytes(
        payload[0..4]
            .try_into()
            .map_err(|_| "Failed to read input length")?,
    ) as usize;

    let hash_start = 4 + input_len;
    // Config hash is a 64-char hex SHA-256 digest (64 UTF-8 bytes)
    let hash_end = hash_start + 64;
    if payload.len() < hash_end {
        return Err(format!(
            "Payload too short for config hash: need {} bytes, have {}",
            hash_end,
            payload.len()
        ));
    }

    let hash_bytes = &payload[hash_start..hash_end];
    let hash_str = std::str::from_utf8(hash_bytes).map_err(|_| "Config hash is not valid UTF-8")?;

    // Validate hex format
    if !hash_str.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Config hash contains non-hex characters".to_string());
    }

    Ok(hash_str.to_string())
}

// =============================================================================
// Random Seed Callback — required by `on_init_random_seed` feature
// =============================================================================

/// Called by junobuild-satellite after the RNG has been seeded on canister upgrade.
/// Custom loggers (`junobuild_satellite::{info,debug,warn,error}`) depend on the
/// RNG for unique document keys, so they only work reliably AFTER this callback.
#[unsafe(no_mangle)]
fn juno_on_init_random_seed() {
    logging::log_info("Satellite", "RNG seeded — custom loggers ready");
}

// =============================================================================
// Oracle Address Endpoint
// =============================================================================

/// Returns the satellite's Public Ethereum address derived from its threshold ECDSA key.
/// This is the oracle address used for on-chain signature verification.
#[update]
async fn get_oracle_address() -> Result<String, String> {
    evm_rpc::get_eth_address().await
}

// =============================================================================
// Error Tracking
// =============================================================================

/// Report a client-side error. Anyone (including unauthenticated callers) can
/// report errors. The satellite generates the `error_id` server-side so the
/// client cannot forge it.
///
/// Returns the `error_id` (e.g. "err_1772598984825320076") which is also the
/// Juno document key. Users give this to support; admins filter by it.
#[update]
fn report_error(payload: ErrorPayload) -> Result<String, String> {
    let now_ns = time();
    let now_ms = now_ns / 1_000_000;

    // error_id IS the Juno document key: "err_{nanosecond_timestamp}".
    // Nanosecond IC time guarantees uniqueness across concurrent callers.
    // Users see this code and give it to support; devs filter by it in admin.
    let error_id = format!("err_{}", now_ns);

    let principal = ic_cdk::caller().to_text();
    let environment = config::NETWORK_NAME.to_string();

    let record = ErrorRecord {
        error_id: error_id.clone(),
        component: payload.component.chars().take(100).collect(),
        message: payload.message.chars().take(500).collect(),
        raw_error: payload.raw_error.chars().take(2000).collect(),
        principal,
        environment,
        timestamp_ms: now_ms,
        resolved: false,
    };

    let canister_id = ic_cdk::id();
    let doc = SetDoc {
        data: encode_doc_data(&record)?,
        description: Some(format!(
            "Error from {} at {}",
            record.component, record.timestamp_ms
        )),
        version: None,
    };

    // Store with error_id as key — it is both the doc key and the user-facing code
    set_doc_store(canister_id, "errors".to_string(), error_id.clone(), doc)?;

    logging::log_info(
        "Errors",
        &format!(
            "Error recorded: {} from component='{}' principal='{}'",
            error_id, record.component, record.principal
        ),
    );

    Ok(error_id)
}

/// Returns all `ErrorRecord` documents from the errors collection.
/// Only callable by principals listed in `config::ADMIN_PRINCIPALS`.
#[update]
fn get_errors() -> Result<Vec<ErrorRecord>, String> {
    let caller = ic_cdk::caller().to_text();
    if !config::ADMIN_PRINCIPALS.contains(&caller.as_str()) {
        return Err("Unauthorized: admin access required".to_string());
    }

    let canister_id = ic_cdk::id();
    let params = ListParams {
        matcher: None,
        order: None,
        paginate: None,
        owner: None,
    };

    let result = list_docs_store(canister_id, "errors".to_string(), &params)
        .map_err(|e| format!("Failed to list errors: {}", e))?;

    let records: Vec<ErrorRecord> = result
        .items
        .into_iter()
        .filter_map(|(_key, doc)| {
            // error_id is the doc key — no backfill needed
            decode_doc_data::<ErrorRecord>(&doc.data).ok()
        })
        .collect();

    Ok(records)
}

/// Deletes specific error records by key. Admin-only.
/// Accepts a list of `error_id` strings matching the Juno document keys.
#[update]
fn delete_errors(keys: Vec<String>) -> Result<(), String> {
    let caller = ic_cdk::caller().to_text();
    if !config::ADMIN_PRINCIPALS.contains(&caller.as_str()) {
        return Err("Unauthorized: admin access required".to_string());
    }

    let canister_id = ic_cdk::id();
    for key in &keys {
        // Juno requires the current version on delete; fetch it first.
        // If the doc doesn't exist, skip it (idempotent).
        let existing = get_doc_store(canister_id, "errors".to_string(), key.clone())
            .map_err(|e| format!("Failed to fetch error {}: {}", key, e))?;

        let Some(doc) = existing else {
            continue;
        };

        delete_doc_store(
            canister_id,
            "errors".to_string(),
            key.clone(),
            DelDoc {
                version: doc.version,
            },
        )
        .map_err(|e| format!("Failed to delete error {}: {}", key, e))?;
    }

    logging::log_info(
        "Errors",
        &format!("Admin deleted {} error record(s)", keys.len()),
    );

    Ok(())
}

/// Toggle the resolved status of a single error record. Admin-only.
/// Fetches the current document version for optimistic concurrency before writing.
#[update]
fn resolve_error(error_id: String, resolved: bool) -> Result<(), String> {
    let caller = ic_cdk::caller().to_text();
    if !config::ADMIN_PRINCIPALS.contains(&caller.as_str()) {
        return Err("Unauthorized: admin access required".to_string());
    }

    let canister_id = ic_cdk::id();

    // Fetch existing doc so we can read the current version (optimistic concurrency)
    let existing = get_doc_store(canister_id, "errors".to_string(), error_id.clone())
        .map_err(|e| format!("Failed to fetch error {}: {}", error_id, e))?
        .ok_or_else(|| format!("Error not found: {}", error_id))?;

    let existing_version = existing.version;
    let mut record: ErrorRecord = decode_doc_data(&existing.data)
        .map_err(|e| format!("Failed to decode error record: {}", e))?;

    record.resolved = resolved;

    let doc = SetDoc {
        data: encode_doc_data(&record)?,
        description: Some(format!(
            "Admin {} error {}",
            if resolved { "resolved" } else { "reopened" },
            error_id
        )),
        version: existing_version,
    };

    set_doc_store(canister_id, "errors".to_string(), error_id.clone(), doc)?;

    logging::log_info(
        "Errors",
        &format!(
            "Error {} marked as resolved={} by admin",
            error_id, resolved
        ),
    );

    Ok(())
}

// =============================================================================
// Replay verification tests (#171)
// =============================================================================

#[cfg(test)]
mod replay_tests {
    use super::*;

    /// Build a minimal length-prefixed payload from a JSON action log string.
    fn make_payload(json: &str) -> Vec<u8> {
        let json_bytes = json.as_bytes();
        let input_len = json_bytes.len() as u32;
        // Pad with 64-byte dummy config hash + 4-byte seed len + dummy seed
        let mut payload = Vec::new();
        payload.extend_from_slice(&input_len.to_be_bytes());
        payload.extend_from_slice(json_bytes);
        payload
            .extend_from_slice(b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); // 64-char hex
        payload.extend_from_slice(&4u32.to_be_bytes()); // seed len
        payload.extend_from_slice(b"1234"); // seed
        payload
    }

    fn action(t: u64, a: &str) -> String {
        format!(r#"{{"t":{},"a":"{}"}}"#, t, a)
    }

    fn actions_json(items: &[(u64, &str)]) -> String {
        let parts: Vec<String> = items.iter().map(|(t, a)| action(*t, a)).collect();
        format!("[{}]", parts.join(","))
    }

    #[test]
    fn test_extract_action_log_valid() {
        let json = actions_json(&[(0, "jump"), (500, "move_right"), (1000, "attack")]);
        let payload = make_payload(&json);
        let actions = extract_action_log(&payload).unwrap();
        assert_eq!(actions.len(), 3);
        assert_eq!(actions[0].t, 0);
        assert_eq!(actions[0].a, "jump");
        assert_eq!(actions[2].a, "attack");
    }

    #[test]
    fn test_extract_action_log_malformed_json() {
        let payload = make_payload("not-json");
        let result = extract_action_log(&payload);
        assert!(result.is_err(), "Expected error on malformed JSON");
    }

    #[test]
    fn test_replay_plausibility_ok() {
        // Valid session: 3 actions spread over 3 seconds
        let actions: Vec<GameAction> = vec![
            GameAction {
                t: 0,
                a: "jump".to_string(),
            },
            GameAction {
                t: 500,
                a: "move_right".to_string(),
            },
            GameAction {
                t: 1000,
                a: "attack".to_string(),
            },
        ];
        assert!(replay_verify_plausibility(&actions).is_ok());
    }

    #[test]
    fn test_replay_plausibility_sub_frame_gap() {
        // Two events 10ms apart (below 16ms minimum)
        let actions: Vec<GameAction> = vec![
            GameAction {
                t: 0,
                a: "jump".to_string(),
            },
            GameAction {
                t: 10,
                a: "move_right".to_string(),
            },
        ];
        let result = replay_verify_plausibility(&actions);
        assert!(result.is_err(), "Expected error for sub-frame gap");
        assert!(result.unwrap_err().contains("CHEAT_DETECTED"));
    }

    #[test]
    fn test_replay_plausibility_attack_too_fast() {
        // Two attack events 100ms apart (below 200ms minimum)
        let actions: Vec<GameAction> = vec![
            GameAction {
                t: 0,
                a: "attack".to_string(),
            },
            GameAction {
                t: 100,
                a: "attack".to_string(),
            },
        ];
        let result = replay_verify_plausibility(&actions);
        assert!(result.is_err(), "Expected error for rapid attack");
        assert!(result.unwrap_err().contains("CHEAT_DETECTED"));
    }

    #[test]
    fn test_replay_plausibility_exceeds_duration() {
        // Action at TIME_LIMIT_MS + REPLAY_GRACE_MS + 1ms
        let too_late = config::TIME_LIMIT_MS + config::REPLAY_GRACE_MS + 1;
        let actions: Vec<GameAction> = vec![
            GameAction {
                t: 0,
                a: "jump".to_string(),
            },
            GameAction {
                t: too_late,
                a: "move_right".to_string(),
            },
        ];
        let result = replay_verify_plausibility(&actions);
        assert!(
            result.is_err(),
            "Expected error for out-of-bounds timestamp"
        );
        assert!(result.unwrap_err().contains("CHEAT_DETECTED"));
    }

    #[test]
    fn test_replay_plausibility_non_monotonic() {
        // Timestamp decreases — clear sign of manipulation
        let actions: Vec<GameAction> = vec![
            GameAction {
                t: 1000,
                a: "jump".to_string(),
            },
            GameAction {
                t: 500,
                a: "move_right".to_string(),
            },
        ];
        let result = replay_verify_plausibility(&actions);
        assert!(
            result.is_err(),
            "Expected error for non-monotonic timestamps"
        );
        assert!(result.unwrap_err().contains("CHEAT_DETECTED"));
    }
}

// =============================================================================
// Include Juno Satellite - MUST be at the end
// =============================================================================

include_satellite!();
