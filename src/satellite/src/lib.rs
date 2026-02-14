//! Tresr Game - Juno Serverless Functions
#![allow(deprecated)]
//!
//! This module implements hook-based serverless functions for the Tresr game.
//! It uses Juno's event-driven architecture where hooks respond to Datastore operations.
//!
//! Collections:
//! - `users`: User profiles with wallet linking and game stats
//! - `deposits`: Deposit requests for EVM transaction verification
//! - `claims`: Reward claim requests
//!
//! HTTP Endpoints:
//! - `game_sessions`: Game session data for anti-cheat validation
//! - `balance_refresh`: Requests to sync balance from on-chain

mod evm_rpc;
mod types;

/// Build-time generated constants from config/tresr.yaml (see build.rs).
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
    OnUploadAssetContext, SetDoc, get_doc_store, include_satellite, set_doc_store,
};
use junobuild_utils::{decode_doc_data, encode_doc_data};
use libsecp256k1::{Message, RecoveryId, Signature, recover};
use tiny_keccak::{Hasher, Keccak};

use types::{
    BalanceRefreshRequest, ClaimRequest, ClaimStatus, DepositRequest, DepositStatus, GameSession,
    RefreshStatus, UserProfile,
};

// =============================================================================
// Assertion - Validate operations BEFORE they are executed
// =============================================================================

/// Single assertion handler for all collections
/// Juno only allows one #[assert_set_doc] per module, so we dispatch by collection name
#[assert_set_doc(collections = ["users", "deposits", "claims", "game_sessions", "balance_refresh"])]
fn assert_set_doc(context: AssertSetDocContext) -> Result<(), String> {
    match context.data.collection.as_str() {
        "users" => assert_user_profile(&context),
        "deposits" => assert_deposit_request(&context),
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

/// Validate deposit requests
fn assert_deposit_request(context: &AssertSetDocContext) -> Result<(), String> {
    let data: DepositRequest = decode_doc_data(&context.data.data.proposed.data)?;

    // Validate transaction hash format
    if !data.tx_hash.starts_with("0x") || data.tx_hash.len() != 66 {
        return Err(
            "Invalid transaction hash format. Must be 0x followed by 64 hex characters."
                .to_string(),
        );
    }

    // Only allow pending status on creation
    if data.status != DepositStatus::Pending {
        return Err("Deposits must be created with 'pending' status.".to_string());
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
#[assert_delete_doc(collections = ["users", "deposits", "claims", "game_sessions"])]
fn assert_delete_doc(_context: AssertDeleteDocContext) -> Result<(), String> {
    // For now, allow deletion. In production, you might want to check for pending claims
    Ok(())
}

// =============================================================================
// Hook - Process operations AFTER they are executed
// =============================================================================

/// Single hook handler for all collections
/// Juno only allows one #[on_set_doc] per module, so we dispatch by collection name
#[on_set_doc(collections = ["users", "deposits", "claims", "game_sessions", "balance_refresh"])]
async fn on_set_doc(context: OnSetDocContext) -> Result<(), String> {
    match context.data.collection.as_str() {
        "deposits" => on_deposit_created(context).await,
        "claims" => on_claim_created(context).await,
        "balance_refresh" => on_balance_refresh(context).await,
        "game_sessions" => on_game_session_update(context).await,
        "users" => Ok(()), // No post-processing needed for user updates
        _ => Ok(()),
    }
}

/// Process deposit requests - verify on EVM chain
async fn on_deposit_created(context: OnSetDocContext) -> Result<(), String> {
    let mut deposit: DepositRequest = decode_doc_data(&context.data.data.after.data)?;

    // Only process pending deposits
    if deposit.status != DepositStatus::Pending {
        return Ok(());
    }

    // Verify the transaction on Avalanche
    match evm_rpc::verify_avalanche_deposit(&deposit.tx_hash).await {
        Ok(verified_amount) => {
            // Update deposit status
            deposit.status = DepositStatus::Verified;
            deposit.amount = verified_amount;
            deposit.verified_at = Some(time() / 1_000_000); // Convert ns to ms

            // Save updated deposit
            let updated_doc = SetDoc {
                data: encode_doc_data(&deposit)?,
                description: context.data.data.after.description.clone(),
                version: context.data.data.after.version,
            };

            set_doc_store(
                context.caller,
                context.data.collection.clone(),
                context.data.key.clone(),
                updated_doc,
            )?;

            // Credit verified deposit to user's wallet balance
            let user_key = context.caller.to_text();
            let user_doc = get_doc_store(context.caller, "users".to_string(), user_key.clone())?;
            if let Some(user_doc) = user_doc {
                let mut user_profile: UserProfile = decode_doc_data(&user_doc.data)?;
                user_profile.wallet.balance += verified_amount;
                let updated_user = SetDoc {
                    data: encode_doc_data(&user_profile)?,
                    description: user_doc.description.clone(),
                    version: user_doc.version,
                };
                set_doc_store(context.caller, "users".to_string(), user_key.clone(), updated_user)?;
                ic_cdk::print(format!(
                    "Deposit verified: {} tokens for user {}. New balance: {}",
                    verified_amount, user_key, user_profile.wallet.balance
                ));
            } else {
                ic_cdk::print(format!(
                    "Warning: Deposit verified but user profile not found for {}",
                    context.caller.to_text()
                ));
            }
        }
        Err(e) => {
            // Mark deposit as failed
            deposit.status = DepositStatus::Failed;
            deposit.error = Some(e.clone());

            let updated_doc = SetDoc {
                data: encode_doc_data(&deposit)?,
                description: context.data.data.after.description.clone(),
                version: context.data.data.after.version,
            };

            set_doc_store(
                context.caller,
                context.data.collection.clone(),
                context.data.key.clone(),
                updated_doc,
            )?;

            ic_cdk::print(format!("Deposit verification failed: {}", e));
        }
    }

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

    // --- Determine recovery ID (v) ---
    // IC t-ECDSA returns r||s without v. Try both recovery IDs (0 and 1)
    // and check which one recovers to the canister's Ethereum address.
    let canister_address = evm_rpc::get_eth_address().await?;
    let canister_addr_lower = canister_address.trim_start_matches("0x").to_lowercase();

    let mut v: u8 = 27; // default
    for recovery_id in 0u8..2u8 {
        let recid = RecoveryId::parse(recovery_id)
            .map_err(|e| format!("Invalid recovery ID: {:?}", e))?;
        let signature = Signature::parse_standard_slice(&sig_bytes)
            .map_err(|e| format!("Invalid signature: {:?}", e))?;
        let message = Message::parse(&eth_signed_hash);

        if let Ok(pubkey) = recover(&message, &signature, &recid) {
            // Derive Ethereum address from recovered public key
            let pubkey_serialized = pubkey.serialize();
            let mut pubkey_hash = [0u8; 32];
            let mut keccak = Keccak::v256();
            keccak.update(&pubkey_serialized[1..65]);
            keccak.finalize(&mut pubkey_hash);
            let recovered_addr = hex::encode(&pubkey_hash[12..32]);

            if recovered_addr == canister_addr_lower {
                v = 27 + recovery_id;
                break;
            }
        }
    }

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

        update_claim_doc(&context, &claim).await?;

        ic_cdk::print(format!(
            "Claim signature generated for user {} session {}",
            context.caller.to_text(),
            claim.game_session_id
        ));

    // Handle claim completion: verify transaction
    } else if claim.status == ClaimStatus::ReadyForChain && claim.tx_hash.is_some() {
        // Verify the claim transaction
        evm_rpc::verify_avalanche_claim_tx(claim.tx_hash.as_ref().unwrap()).await?;
        claim.status = ClaimStatus::Completed;

        update_claim_doc(&context, &claim).await?;

        // Mark session as claimed
        let session_doc = get_doc_store(
            context.caller,
            "game_sessions".to_string(),
            claim.game_session_id.clone(),
        )?;

        if let Some(session_doc) = session_doc {
            let mut session: GameSession = decode_doc_data(&session_doc.data)?;
            session.reward_claimed = true;

            update_session_doc(
                &context,
                &session,
                claim.game_session_id.clone(),
                session_doc
                    .description
                    .expect("session description missing"),
                session_doc.version.expect("session version missing"),
            )
            .await?;
        }

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

/// Log game session completion for analytics
async fn on_game_session_update(context: OnSetDocContext) -> Result<(), String> {
    let session: GameSession = decode_doc_data(&context.data.data.after.data)?;

    // Log when a session ends with boss defeated
    if session.ended_at.is_some() && session.boss_defeated {
        ic_cdk::print(format!(
            "Game won! User {} defeated boss with score {} and {} keys",
            context.caller.to_text(),
            session.score,
            session.keys_collected
        ));
    }

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
    deposit_tx_hash: String,
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

    // 1. Fetch session from Datastore (assume Juno Collection integration)
    // Stub: simulate session data
    let _session = GameSession {
        started_at: 0,
        ended_at: Some(0),
        keys_collected: reported_keys,
        boss_defeated: true,
        score: 0,
        reward_claimed: false,
    };

    // Verify deposit_tx_hash matches (stub)
    if deposit_tx_hash != "0x123..." {
        return Err("Invalid deposit tx".to_string());
    }

    // 2. Query vault balance (stub: simulate RPC call)
    let vault_balance: u128 = fetch_vault_balance_stub().await?;
    if vault_balance < 1_000_000_000_000_000_000u128 {
        // 1e15 wei
        return Err("Low pot".to_string());
    }

    // 3. Verify replay (stub: simple check)
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

    // 4. Calc amount
    let deposit_amount = 10_000_000_000_000_000_000u128; // 10 TRESR stub
    let perf_mult = (reported_keys as f64 / config::MAX_KEYS_COLLECTED as f64) * 0.5;
    let max_perf = ((vault_balance as f64 * perf_mult) as u128).min(vault_balance / 2);
    let guaranteed = deposit_amount * 11 / 10;
    let amount = max_perf.max(guaranteed).min(vault_balance);

    // 5. Sign (stub: use test key)
    let signature =
        generate_claim_signature_stub(&session_id, &caller_text, amount as u64)?;

    Ok((amount, signature))
}

async fn fetch_vault_balance_stub() -> Result<u128, String> {
    // Stub: return fixed balance
    Ok(100_000_000_000_000_000_000u128) // 100 TRESR
}

async fn replay_verify_stub(_inputs: &[u8], _pot: u128) -> Result<(u64, bool), String> {
    // Stub: always verify with reported keys
    Ok((150, true)) // Assume full keys, boss killed
}

fn generate_claim_signature_stub(
    _session_id: &str,
    _user_address: &str,
    _amount: u64,
) -> Result<Vec<u8>, String> {
    // Stub: return fixed sig
    Ok(vec![0x12, 0x34]) // Placeholder
}

// =============================================================================
// Include Juno Satellite - MUST be at the end
// =============================================================================

include_satellite!();
