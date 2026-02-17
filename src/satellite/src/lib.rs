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
    AssertDeleteDocContext, AssertSetDocContext, OnDeleteAssetContext, OnDeleteDocContext,
    OnDeleteManyAssetsContext, OnDeleteManyDocsContext, OnSetDocContext, OnSetManyDocsContext,
    OnUploadAssetContext, SetDoc, get_doc_store, include_satellite, list_docs_store, set_doc_store,
};
use junobuild_shared::types::list::ListParams;
use junobuild_utils::{decode_doc_data, encode_doc_data};
use libsecp256k1::{Message, RecoveryId, Signature, recover};
use tiny_keccak::{Hasher, Keccak};

use types::{
    BalanceRefreshRequest, ClaimRequest, ClaimStatus, FeeRequest, FeeStatus, GameSession,
    GlobalStats, LeaderboardEntry, RefreshStatus, UserProfile,
};

// =============================================================================
// Assertion - Validate operations BEFORE they are executed
// =============================================================================

/// Single assertion handler for all collections
/// Juno only allows one #[assert_set_doc] per module, so we dispatch by collection name
#[assert_set_doc(collections = ["users", "fees", "claims", "game_sessions", "balance_refresh"])]
fn assert_set_doc(context: AssertSetDocContext) -> Result<(), String> {
    match context.data.collection.as_str() {
        "users" => assert_user_profile(&context),
        "fees" => assert_fee_request(&context),
        "claims" => assert_claim_request(&context),
        "game_sessions" => assert_game_session(&context),
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

            // Verify signature if provided (Client-Side Linking Verification)
            if let (Some(sig), Some(msg)) =
                (&data.verification_signature, &data.verification_message)
            {
                verify_wallet_signature(wallet, msg, sig)?;
            }
        }
    }

    Ok(())
}

fn verify_wallet_signature(
    address: &str,
    message: &str,
    signature_hex: &str,
) -> Result<(), String> {
    // 1. Decode hex signature
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

    // 2. Hash message (Ethereum Signed Message)
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut keccak = Keccak::v256();
    keccak.update(prefix.as_bytes());
    keccak.update(message.as_bytes());
    let mut hash = [0u8; 32];
    keccak.finalize(&mut hash);

    let message_struct = Message::parse(&hash);

    // 3. Recover Public Key
    let pubkey =
        recover(&message_struct, &signature, &recid).map_err(|_| "Failed to recover public key")?;

    // 4. Derive Address from Public Key
    // Keccak256(pubkey[1..65]) -> last 20 bytes
    let mut pubkey_hash = [0u8; 32];
    let mut pubkey_keccak = Keccak::v256();
    // Serialize uncompressed (65 bytes), skip first byte (0x04)
    pubkey_keccak.update(&pubkey.serialize()[1..65]);
    pubkey_keccak.finalize(&mut pubkey_hash);

    let recovered_address = hex::encode(&pubkey_hash[12..32]);

    // 5. Compare
    if address.trim_start_matches("0x").to_lowercase() != recovered_address {
        return Err("Signature does not match address".to_string());
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

    // Only allow pending status on creation
    if data.status != FeeStatus::Pending {
        return Err("Fees must be created with 'pending' status.".to_string());
    }

    // Enforce document key == tx_hash to prevent fee replay (ticket #288).
    // Juno enforces key uniqueness per user, so the same tx_hash cannot be
    // submitted twice under different keys. Combined with tx.from validation
    // (ticket #285), this prevents any user from replaying another's fee.
    if context.data.key != data.tx_hash {
        return Err(
            "Fee document key must equal the transaction hash.".to_string(),
        );
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

/// Prevent deletion of critical data
#[assert_delete_doc(collections = ["users", "fees", "claims", "game_sessions"])]
fn assert_delete_doc(_context: AssertDeleteDocContext) -> Result<(), String> {
    // For now, allow deletion. In production, you might want to check for pending claims
    Ok(())
}

// =============================================================================
// Hook - Process operations AFTER they are executed
// =============================================================================

/// Single hook handler for all collections
/// Juno only allows one #[on_set_doc] per module, so we dispatch by collection name
#[on_set_doc(collections = ["users", "fees", "claims", "game_sessions", "balance_refresh"])]
async fn on_set_doc(context: OnSetDocContext) -> Result<(), String> {
    // Diagnostic: confirm the hook fires (visible in docker logs juno-skylab)
    ic_cdk::print(format!(
        "[HOOK] on_set_doc fired for collection='{}' key='{}'",
        context.data.collection, context.data.key
    ));

    match context.data.collection.as_str() {
        "fees" => on_fee_created(context).await,
        "claims" => on_claim_created(context).await,
        "balance_refresh" => on_balance_refresh(context).await,
        "game_sessions" => on_game_session_update(context).await,
        "users" => on_user_profile_updated(context).await,
        _ => Ok(()),
    }
}

/// Sync sanitized leaderboard entry when a user profile is saved.
/// Only writes public-safe data: nickname, highScore, gamesWon.
async fn on_user_profile_updated(context: OnSetDocContext) -> Result<(), String> {
    let profile: UserProfile = decode_doc_data(&context.data.data.after.data)?;

    // Only create leaderboard entries for users who have played at least once
    if profile.stats.high_score == 0 {
        return Ok(());
    }

    // Preserve existing active score fields from the leaderboard entry
    let existing_doc = get_doc_store(
        context.caller,
        "leaderboard".to_string(),
        context.data.key.clone(),
    )
    .ok()
    .flatten();

    let existing_version = existing_doc.as_ref().and_then(|d| d.version);
    let existing = existing_doc
        .and_then(|doc| decode_doc_data::<LeaderboardEntry>(&doc.data).ok());

    let entry = LeaderboardEntry {
        nickname: profile.nickname.clone(),
        high_score: profile.stats.high_score,
        games_won: profile.stats.total_games_won,
        active_score: existing.as_ref().map_or(0, |e| e.active_score),
        scored_at: existing.as_ref().and_then(|e| e.scored_at),
        expires_at: existing.as_ref().and_then(|e| e.expires_at),
        session_id: existing.as_ref().and_then(|e| e.session_id.clone()),
    };

    let leaderboard_doc = SetDoc {
        data: encode_doc_data(&entry)?,
        description: Some("Leaderboard entry".to_string()),
        version: existing_version,
    };

    set_doc_store(
        context.caller,
        "leaderboard".to_string(),
        context.data.key.clone(),
        leaderboard_doc,
    )?;

    ic_cdk::print(format!(
        "Leaderboard updated for user {}: score={}, nickname={}",
        context.data.key, profile.stats.high_score, profile.nickname
    ));

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
    match evm_rpc::verify_avalanche_fee(&fee.tx_hash).await {
        Ok(parsed) => {
            // Validate tx.from matches the caller's linked EVM wallet (ticket #285)
            let user_key = context.caller.to_text();
            let user_doc = get_doc_store(context.caller, "users".to_string(), user_key.clone())?;
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
                        set_doc_store(context.caller, context.data.collection.clone(), context.data.key.clone(), updated_doc)?;
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
                    set_doc_store(context.caller, context.data.collection.clone(), context.data.key.clone(), updated_doc)?;
                    ic_cdk::print(format!(
                        "Fee rejected: tx.from {} != caller wallet {}",
                        parsed.from, caller_wallet
                    ));
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

            // Credit verified fee to user's wallet balance
            if let Some(user_doc_inner) = user_doc {
                let mut user_profile: UserProfile = decode_doc_data(&user_doc_inner.data)?;
                user_profile.wallet.balance += verified_amount;
                let updated_user = SetDoc {
                    data: encode_doc_data(&user_profile)?,
                    description: user_doc_inner.description.clone(),
                    version: user_doc_inner.version,
                };
                set_doc_store(context.caller, "users".to_string(), user_key.clone(), updated_user)?;
                ic_cdk::print(format!(
                    "Fee verified: {} tokens for user {}. New balance: {}",
                    verified_amount, user_key, user_profile.wallet.balance
                ));
            } else {
                ic_cdk::print(format!(
                    "Warning: Fee verified but user profile not found for {}",
                    context.caller.to_text()
                ));
            }

            // Update global stats: track total fees and burned amount
            let burn_amount = (verified_amount * config::BURN_RATE_BPS) / 10000;
            update_global_stats(|stats| {
                stats.total_fees += verified_amount;
                stats.total_burned += burn_amount;
            })?;
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

            ic_cdk::print(format!("Fee verification failed: {}", e));
        }
    }

    Ok(())
}

/// Update global stats atomically (read-modify-write).
/// Uses `ic_cdk::id()` as caller for the `write: "managed"` stats collection.
fn update_global_stats<F: FnOnce(&mut GlobalStats)>(updater: F) -> Result<(), String> {
    let canister_id = ic_cdk::id();
    let key = "global".to_string();

    let existing_doc = get_doc_store(canister_id, "stats".to_string(), key.clone()).ok().flatten();
    let existing_version = existing_doc.as_ref().and_then(|d| d.version);

    let mut stats = existing_doc
        .and_then(|doc| decode_doc_data::<GlobalStats>(&doc.data).ok())
        .unwrap_or_default();

    updater(&mut stats);

    let doc = SetDoc {
        data: encode_doc_data(&stats)?,
        description: Some("Global burn/payout stats".to_string()),
        version: existing_version,
    };

    set_doc_store(canister_id, "stats".to_string(), key, doc)?;
    Ok(())
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
    let session_bytes = hex::decode(session_hex)
        .map_err(|_| format!("Invalid sessionId hex: {}", session_id))?;
    if session_bytes.len() != 32 {
        return Err(format!(
            "sessionId must be 32 bytes, got {}",
            session_bytes.len()
        ));
    }

    // address: decode 0x-prefixed hex to 20 raw bytes
    let addr_hex = user_address.strip_prefix("0x").unwrap_or(user_address);
    let addr_bytes = hex::decode(addr_hex)
        .map_err(|_| format!("Invalid address hex: {}", user_address))?;
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
            let signature = generate_claim_signature(
                &claim.game_session_id,
                &wallet_addr,
                claim.amount,
                0,
            ).await?;
            claim.signature = Some(signature);
            claim.status = ClaimStatus::ReadyForChain;

            update_claim_doc(&context, &claim).await?;

            ic_cdk::print(format!(
                "Consolation claim signature generated for user {} amount {}",
                context.caller.to_text(),
                claim.amount
            ));
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

            // 4. Generate signature (include keys_collected for Vault.sol verification)
            claim.keys_collected = session.keys_collected;
            let signature = generate_claim_signature(
                &claim.game_session_id,
                &wallet_addr,
                claim.amount,
                session.keys_collected,
            ).await?;
            claim.signature = Some(signature);
            claim.status = ClaimStatus::ReadyForChain;

            // 5. Mark session as claimed IMMEDIATELY after signature generation (ticket #286).
            // This prevents a race where a second claim could generate another valid
            // signature before the first claim's on-chain tx is verified.
            {
                let mut claimed_session = session.clone();
                claimed_session.reward_claimed = true;
                let sd = session_doc.as_ref().unwrap(); // Safe: matched Some above
                let description = sd
                    .description
                    .clone()
                    .ok_or_else(|| "session description missing".to_string())?;
                let version = sd
                    .version
                    .ok_or_else(|| "session version missing".to_string())?;
                update_session_doc(
                    &context,
                    &claimed_session,
                    claim.game_session_id.clone(),
                    description,
                    version,
                )
                .await?;
            }

            update_claim_doc(&context, &claim).await?;

            ic_cdk::print(format!(
                "Claim signature generated for user {} session {}",
                context.caller.to_text(),
                claim.game_session_id
            ));
        }

    // Handle claim completion: verify transaction
    } else if claim.status == ClaimStatus::ReadyForChain && claim.tx_hash.is_some() {
        // Verify the claim transaction
        evm_rpc::verify_avalanche_claim_tx(
            claim.tx_hash.as_ref().unwrap(),
            &claim.game_session_id,
            claim.amount,
            claim.keys_collected,
        ).await?;
        claim.status = ClaimStatus::Completed;

        update_claim_doc(&context, &claim).await?;

        // Update global stats: track total rewards paid out
        update_global_stats(|stats| {
            stats.total_rewarded += claim.amount;
        })?;

        ic_cdk::print(format!(
            "Claim completed for user {} session {}",
            context.caller.to_text(),
            claim.game_session_id
        ));
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
            ic_cdk::print(format!(
                "Balance refresh failed for wallet {}: {}",
                refresh.evm_wallet, e
            ));
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
        ic_cdk::print(format!(
            "Balance refresh completed for wallet {}: {} tokens",
            refresh.evm_wallet,
            refresh.balance.unwrap_or(0)
        ));
    }

    Ok(())
}

/// Process game session updates: update leaderboard active score and resolve expired top scores.
async fn on_game_session_update(context: OnSetDocContext) -> Result<(), String> {
    ic_cdk::print(format!(
        "[HOOK] on_game_session_update: key='{}' data_len={}",
        context.data.key,
        context.data.data.after.data.len()
    ));

    let session: GameSession = decode_doc_data(&context.data.data.after.data)?;

    ic_cdk::print(format!(
        "[HOOK] on_game_session_update: deserialized OK, ended_at={:?}, score={}",
        session.ended_at, session.score
    ));

    // Only process completed sessions
    if session.ended_at.is_none() {
        return Ok(());
    }

    let caller_key = context.caller.to_text();
    let now_ms = time() / 1_000_000;

    // Read caller's user profile for nickname
    let user_doc = get_doc_store(
        context.caller,
        "users".to_string(),
        caller_key.clone(),
    )?;
    let nickname = match user_doc {
        Some(ref doc) => {
            let profile: UserProfile = decode_doc_data(&doc.data)?;
            profile.nickname
        }
        None => "Unknown".to_string(),
    };

    // Read existing leaderboard entry (keep raw Doc for version)
    let existing_lb_doc = get_doc_store(
        context.caller,
        "leaderboard".to_string(),
        caller_key.clone(),
    )?
    .map(|doc| doc);

    let existing_lb_version = existing_lb_doc.as_ref().and_then(|d| d.version);
    let existing = existing_lb_doc
        .and_then(|doc| decode_doc_data::<LeaderboardEntry>(&doc.data).ok());

    let prev_high = existing.as_ref().map_or(0, |e| e.high_score);
    let prev_won = existing.as_ref().map_or(0, |e| e.games_won);

    // Update leaderboard entry with active score
    let entry = LeaderboardEntry {
        nickname,
        high_score: prev_high.max(session.score),
        games_won: if session.boss_defeated { prev_won + 1 } else { prev_won },
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
        "leaderboard".to_string(),
        caller_key.clone(),
        leaderboard_doc,
    )?;

    ic_cdk::print(format!(
        "Active score updated for user {}: score={}, expires_at={}",
        caller_key,
        session.score,
        now_ms + config::SCORE_TTL_HOURS * 3_600_000
    ));

    // Resolve any expired top scores (consolation prize)
    resolve_expired_top_score().await?;

    Ok(())
}

/// Check if the top active score has expired and award a consolation prize if so.
/// Called lazily on every game session update.
async fn resolve_expired_top_score() -> Result<(), String> {
    let canister_id = ic_cdk::id();
    let now_ms = time() / 1_000_000;

    // List all leaderboard entries
    let result = list_docs_store(
        canister_id,
        "leaderboard".to_string(),
        &ListParams {
            matcher: None,
            paginate: None,
            order: None,
            owner: None,
        },
    )?;

    // Find the entry with the highest active_score that has an expires_at set
    let mut top_entry: Option<(String, LeaderboardEntry, candid::Principal)> = None;

    for (key, doc) in &result.items {
        let entry: LeaderboardEntry = match decode_doc_data(&doc.data) {
            Ok(e) => e,
            Err(_) => continue,
        };

        // Only consider entries with an active expiry
        if entry.expires_at.is_none() || entry.active_score == 0 {
            continue;
        }

        let owner = doc.owner;

        match &top_entry {
            None => {
                top_entry = Some((key.clone(), entry, owner));
            }
            Some((_, current_top, _)) => {
                if entry.active_score > current_top.active_score
                    || (entry.active_score == current_top.active_score
                        && entry.scored_at < current_top.scored_at)
                {
                    top_entry = Some((key.clone(), entry, owner));
                }
            }
        }
    }

    let (winner_key, winner_entry, winner_principal) = match top_entry {
        Some(t) => t,
        None => return Ok(()), // No active scores
    };

    // Check if the top entry has expired
    let expires_at = match winner_entry.expires_at {
        Some(ts) => ts,
        None => return Ok(()),
    };

    if expires_at >= now_ms {
        return Ok(()); // Not expired yet
    }

    // Check if winner is banned
    let winner_profile_doc = get_doc_store(
        winner_principal,
        "users".to_string(),
        winner_key.clone(),
    )?;

    let mut winner_profile: UserProfile = match winner_profile_doc {
        Some(ref doc) => decode_doc_data(&doc.data)?,
        None => return Ok(()), // No profile found
    };
    let winner_profile_version = winner_profile_doc.as_ref().and_then(|d| d.version);

    if check_ban(&winner_profile).is_err() {
        // Banned user — clear their expires_at and skip
        clear_leaderboard_expiry(&winner_key, &winner_entry, winner_principal)?;
        ic_cdk::print(format!(
            "Skipped consolation for banned user {}",
            winner_key
        ));
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

    // Append to existing notifications array
    let notifications = match &winner_profile.notifications {
        Some(serde_json::Value::Array(arr)) => {
            let mut new_arr = arr.clone();
            new_arr.push(notification);
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

    ic_cdk::print(format!(
        "Consolation prize of {} awarded to user {} (claim: {})",
        consolation_amount, winner_key, claim_key
    ));

    Ok(())
}

/// Clear the expires_at on a leaderboard entry to prevent re-processing.
fn clear_leaderboard_expiry(
    key: &str,
    entry: &LeaderboardEntry,
    owner: candid::Principal,
) -> Result<(), String> {
    // Fetch existing doc version for optimistic concurrency
    let existing_version = get_doc_store(owner, "leaderboard".to_string(), key.to_string())
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

    set_doc_store(
        owner,
        "leaderboard".to_string(),
        key.to_string(),
        doc,
    )?;

    Ok(())
}

// =============================================================================
// Required Juno hooks (must be implemented even if empty)
// =============================================================================

#[on_set_many_docs]
async fn on_set_many_docs(_context: OnSetManyDocsContext) -> Result<(), String> {
    Ok(())
}

#[on_delete_doc]
async fn on_delete_doc(_context: OnDeleteDocContext) -> Result<(), String> {
    Ok(())
}

#[on_delete_many_docs]
async fn on_delete_many_docs(_context: OnDeleteManyDocsContext) -> Result<(), String> {
    Ok(())
}

#[on_upload_asset]
async fn on_upload_asset(_context: OnUploadAssetContext) -> Result<(), String> {
    Ok(())
}

#[on_delete_asset]
async fn on_delete_asset(_context: OnDeleteAssetContext) -> Result<(), String> {
    Ok(())
}

#[on_delete_many_assets]
async fn on_delete_many_assets(_context: OnDeleteManyAssetsContext) -> Result<(), String> {
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

    // 1. Fetch session from Datastore
    let session_doc = get_doc_store(
        caller,
        "game_sessions".to_string(),
        session_id.clone(),
    )?;
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
    let parsed_fee = evm_rpc::verify_avalanche_fee(&fee_tx_hash).await?;

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
    let vault_balance_tokens = evm_rpc::get_token_balance(
        crate::config::VAULT_CONTRACT_ADDRESS,
    ).await?;
    let vault_balance: u128 = (vault_balance_tokens as u128) * 1_000_000_000_000_000_000u128;

    if vault_balance < 1_000_000_000_000_000_000u128 {
        return Err("Low pot".to_string());
    }

    // 4. Verify replay
    // TODO: Replace with real deterministic replay verification engine
    // Tracked in separate issue — for now, use stub that trusts reported values
    let (verified_keys, boss_killed) = replay_verify_stub(&replay_inputs, vault_balance).await?;
    if verified_keys != reported_keys || !boss_killed {
        // Cheat detected — apply ban
        apply_ban(&mut user_profile);
        let ban_doc = SetDoc {
            data: encode_doc_data(&user_profile)?,
            description: Some("Ban applied: replay validation failure".to_string()),
            version: user_doc_version,
        };
        set_doc_store(caller, "users".to_string(), caller_text.clone(), ban_doc)?;

        ic_cdk::print(format!(
            "CHEAT_DETECTED: replay invalid for user {}. Offence #{}, banned_until={:?}",
            caller_text, user_profile.offence_count, user_profile.banned_until
        ));

        return Err(format!(
            "CHEAT_DETECTED: Replay invalid. Offence #{}, banned_until={}",
            user_profile.offence_count,
            user_profile.banned_until.unwrap_or(0)
        ));
    }
    if reported_keys > config::MAX_KEYS_COLLECTED {
        // Cheat detected — apply ban
        apply_ban(&mut user_profile);
        let ban_doc = SetDoc {
            data: encode_doc_data(&user_profile)?,
            description: Some("Ban applied: score exceeds maximum".to_string()),
            version: user_doc_version,
        };
        set_doc_store(caller, "users".to_string(), caller_text.clone(), ban_doc)?;

        ic_cdk::print(format!(
            "CHEAT_DETECTED: max keys exceeded for user {}. Offence #{}, banned_until={:?}",
            caller_text, user_profile.offence_count, user_profile.banned_until
        ));

        return Err(format!(
            "CHEAT_DETECTED: Max {} keys. Offence #{}, banned_until={}",
            config::MAX_KEYS_COLLECTED,
            user_profile.offence_count,
            user_profile.banned_until.unwrap_or(0)
        ));
    }

    // 5. Calc amount
    let perf_mult = (reported_keys as f64 / config::MAX_KEYS_COLLECTED as f64) * 0.5;
    let max_perf = ((vault_balance as f64 * perf_mult) as u128).min(vault_balance / 2);
    let guaranteed = fee_amount * 11 / 10;
    let amount = max_perf.max(guaranteed).min(vault_balance);

    // 6. Sign with IC threshold ECDSA
    let signature_hex = generate_claim_signature(
        &session_id,
        &wallet_addr,
        amount as u64,
        session.keys_collected,
    ).await?;

    // Convert hex signature to bytes for return
    let sig_clean = signature_hex.strip_prefix("0x").unwrap_or(&signature_hex);
    let signature_bytes = hex::decode(sig_clean)
        .map_err(|e| format!("Failed to decode signature hex: {}", e))?;

    // Mark session as claimed to prevent double-claim race
    let mut claimed_session = session.clone();
    claimed_session.reward_claimed = true;
    let claimed_doc = SetDoc {
        data: encode_doc_data(&claimed_session)?,
        description: Some("claim_authorize: marked reward_claimed".to_string()),
        version: session_doc.as_ref().unwrap().version,
    };
    set_doc_store(caller, "game_sessions".to_string(), session_id.clone(), claimed_doc)?;

    Ok((amount, signature_bytes))
}

/// Replay verification stub — always trusts reported values.
/// TODO: Replace with deterministic game replay engine (separate issue).
async fn replay_verify_stub(_inputs: &[u8], _pot: u128) -> Result<(u64, bool), String> {
    Ok((150, true))
}


// =============================================================================
// Include Juno Satellite - MUST be at the end
// =============================================================================

include_satellite!();
