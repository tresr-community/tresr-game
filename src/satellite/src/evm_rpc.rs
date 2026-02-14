#![allow(deprecated)]
#![allow(dead_code)]
use ic_cdk::api::call::call;

use crate::types::{RpcRequest, RpcResponse};
use candid::Principal;
use ic_cdk::management_canister::{
    EcdsaCurve, EcdsaKeyId, EcdsaPublicKeyArgs, SignWithEcdsaArgs, ecdsa_public_key,
    sign_with_ecdsa as mgmt_sign_with_ecdsa,
};
use num_bigint::BigUint;
use num_traits::ToPrimitive;
use rlp::RlpStream;
use tiny_keccak::{Hasher, Keccak};

// ECDSA key ID for signing transactions
// Use "test_key_1" for development, "key_1" for production
const ECDSA_KEY_NAME: &str = "test_key_1";

// Default gas parameters (fallback when dynamic estimation fails)
const DEFAULT_GAS_LIMIT: u64 = 21000;
const DEFAULT_GAS_PRICE: u64 = 25_000_000_000; // 25 Gwei

// Vault.deposit(uint256,bytes32) function selector
const DEPOSIT_SELECTOR: &str = "47e7ef24";
// ERC-20 transfer(address,uint256) function selector
const TRANSFER_SELECTOR: [u8; 4] = [0xa9, 0x05, 0x9c, 0xbb];

/// Verify a deposit transaction on Avalanche
pub async fn verify_avalanche_deposit(tx_hash: &str) -> Result<u64, String> {
    // Anvil mock: skip real RPC verification in local dev
    if crate::config::NETWORK_NAME == "anvil" {
        ic_cdk::print(format!("ANVIL_MOCK: verify_avalanche_deposit for {}", tx_hash));
        return Ok(10);
    }

    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_getTransactionByHash".to_string(),
        params: serde_json::to_string(&vec![serde_json::json!(tx_hash)]).unwrap(),
        id: 1,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("EVM RPC call failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("RPC error {}: {}", error.code, error.message));
    }

    if let Some(result_str) = response.result {
        let result_json: serde_json::Value = serde_json::from_str(&result_str)
            .map_err(|e| format!("Failed to parse JSON result: {}", e))?;
        let amount = parse_deposit_input(&result_json)?;

        // Verify the transaction actually succeeded on-chain
        verify_transaction_receipt(tx_hash).await?;

        Ok(amount)
    } else {
        Err("No transaction found".to_string())
    }
}

/// Verify a claim transaction on Avalanche
pub async fn verify_avalanche_claim_tx(tx_hash: &str) -> Result<(), String> {
    // Anvil mock: skip real RPC verification in local dev
    if crate::config::NETWORK_NAME == "anvil" {
        ic_cdk::print(format!("ANVIL_MOCK: verify_avalanche_claim_tx for {}", tx_hash));
        return Ok(());
    }

    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_getTransactionByHash".to_string(),
        params: serde_json::to_string(&vec![serde_json::json!(tx_hash)]).unwrap(),
        id: 1,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("EVM RPC call failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("RPC error {}: {}", error.code, error.message));
    }

    if let Some(result_str) = response.result {
        let result_json: serde_json::Value = serde_json::from_str(&result_str)
            .map_err(|e| format!("Failed to parse JSON result: {}", e))?;
        verify_claim_transaction(&result_json)?;

        // Verify the transaction actually succeeded on-chain
        verify_transaction_receipt(tx_hash).await?;

        Ok(())
    } else {
        Err("Transaction not found".to_string())
    }
}

/// Verify that the transaction is a valid claim to the vault contract
fn verify_claim_transaction(tx_data: &serde_json::Value) -> Result<(), String> {
    // Check 'to' address matches vault
    let to_address = tx_data
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Transaction missing 'to' field".to_string())?;

    if !to_address.eq_ignore_ascii_case(crate::config::VAULT_CONTRACT_ADDRESS) {
        return Err(format!(
            "Transaction 'to' address {} does not match vault {}",
            to_address, crate::config::VAULT_CONTRACT_ADDRESS
        ));
    }

    // TODO: Parse input data to verify claim params (selector, sessionId, amount)
    // For now, assume if to vault, it's valid (frontend ensures params)

    Ok(())
}

/// Parse a Vault.deposit(uint256,bytes32) transaction's input data.
/// Verifies the tx targets the Vault contract, checks the function selector,
/// and decodes the ABI-encoded amount parameter.
fn parse_deposit_input(tx_data: &serde_json::Value) -> Result<u64, String> {
    // 1. Verify tx.to matches the Vault contract address
    let to_address = tx_data
        .get("to")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Transaction missing 'to' field".to_string())?;

    if !to_address.eq_ignore_ascii_case(crate::config::VAULT_CONTRACT_ADDRESS) {
        return Err(format!(
            "Deposit tx 'to' {} does not match vault {}",
            to_address, crate::config::VAULT_CONTRACT_ADDRESS
        ));
    }

    // 2. Parse the input data field (ERC-20 contract call, not tx.value)
    let input_hex = tx_data
        .get("input")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Transaction missing 'input' field".to_string())?;

    let input_clean = input_hex.strip_prefix("0x").unwrap_or(input_hex);

    // Minimum length: 4-byte selector + 32-byte amount + 32-byte sessionId = 68 bytes = 136 hex chars
    if input_clean.len() < 136 {
        return Err(format!(
            "Input data too short for deposit call: {} chars",
            input_clean.len()
        ));
    }

    // 3. Verify function selector: deposit(uint256,bytes32) = 0x47e7ef24
    let selector = &input_clean[0..8];
    if selector != DEPOSIT_SELECTOR {
        return Err(format!(
            "Wrong function selector: expected {} (deposit), got {}",
            DEPOSIT_SELECTOR, selector
        ));
    }

    // 4. Decode amount from bytes 4..36 (first ABI parameter, uint256)
    let amount_hex = &input_clean[8..72]; // 64 hex chars = 32 bytes
    let wei_amount = BigUint::parse_bytes(amount_hex.as_bytes(), 16)
        .ok_or_else(|| format!("Failed to parse deposit amount: {}", amount_hex))?;

    // 5. Convert from wei to tokens (1 token = 10^18 wei)
    let one_token = BigUint::from(10u64).pow(18);
    let tokens = &wei_amount / &one_token;

    tokens
        .to_u64()
        .ok_or_else(|| format!("Deposit amount too large for u64: {} wei", wei_amount))
}

/// Verify a transaction receipt shows success (status 0x1)
async fn verify_transaction_receipt(tx_hash: &str) -> Result<(), String> {
    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_getTransactionReceipt".to_string(),
        params: serde_json::to_string(&vec![serde_json::json!(tx_hash)]).unwrap(),
        id: 1,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("Receipt RPC call failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("Receipt RPC error {}: {}", error.code, error.message));
    }

    let result_str = response.result
        .ok_or_else(|| "Transaction receipt not found (tx may be pending)".to_string())?;

    let receipt: serde_json::Value = serde_json::from_str(&result_str)
        .map_err(|e| format!("Failed to parse receipt JSON: {}", e))?;

    let status = receipt
        .get("status")
        .and_then(|s| s.as_str())
        .ok_or_else(|| "Receipt missing 'status' field".to_string())?;

    if status != "0x1" {
        return Err("Transaction reverted on-chain (status != 0x1)".to_string());
    }

    Ok(())
}

/// Build an ERC-20 transfer withdrawal transaction, sign it with threshold ECDSA,
/// and return the signed tx as a hex string.
///
/// Targets the TRESR token contract with `transfer(address,uint256)` calldata.
/// Native AVAX value is 0 — this is a token transfer, not a native transfer.
async fn build_withdrawal_tx(to_address: &str, amount: u64) -> Result<String, String> {
    // Step 1: Get our Ethereum address from ECDSA public key
    let from_address = get_eth_address().await?;

    // Step 2: Get the current nonce for our address
    let nonce = get_transaction_count(&from_address).await?;

    // Step 3: Build ERC-20 transfer(address,uint256) calldata
    let recipient_hex = to_address.strip_prefix("0x").unwrap_or(to_address);
    let recipient_bytes = hex::decode(recipient_hex)
        .map_err(|e| format!("Invalid recipient address: {}", e))?;
    if recipient_bytes.len() != 20 {
        return Err(format!("Recipient address must be 20 bytes, got {}", recipient_bytes.len()));
    }
    let amount_wei = BigUint::from(amount) * BigUint::from(10u64).pow(18);
    let amount_be = amount_wei.to_bytes_be();

    // ABI encode: selector (4) + address padded to 32 + uint256 padded to 32 = 68 bytes
    let mut calldata = Vec::with_capacity(68);
    calldata.extend_from_slice(&TRANSFER_SELECTOR);           // 4 bytes
    calldata.extend_from_slice(&[0u8; 12]);                   // left-pad address to 32 bytes
    calldata.extend_from_slice(&recipient_bytes);              // 20 bytes
    let pad_len = 32usize.saturating_sub(amount_be.len());
    calldata.extend_from_slice(&vec![0u8; pad_len]);           // left-pad amount to 32 bytes
    calldata.extend_from_slice(&amount_be);

    let calldata_hex = format!("0x{}", hex::encode(&calldata));

    // Step 4: Parse token contract address as the RLP `to` field
    let token_addr_clean = crate::config::TRESR_TOKEN_CONTRACT
        .strip_prefix("0x")
        .unwrap_or(crate::config::TRESR_TOKEN_CONTRACT);
    let token_bytes = hex::decode(token_addr_clean)
        .map_err(|e| format!("Invalid token contract address: {}", e))?;

    // Step 5: Get dynamic gas parameters with fallback to defaults
    let gas_price = get_gas_price().await.unwrap_or(DEFAULT_GAS_PRICE);
    let gas_limit = estimate_gas(
        &from_address,
        crate::config::TRESR_TOKEN_CONTRACT,
        &calldata_hex,
        None, // value is 0 for ERC-20 transfer
    )
    .await
    .map(|g| g * 110 / 100) // 10% buffer
    .unwrap_or(65_000);      // ERC-20 transfers typically need ~65k gas

    // Step 6: Build the unsigned transaction for signing (EIP-155)
    let mut rlp_stream = RlpStream::new();
    rlp_stream.begin_list(9);
    rlp_stream.append(&nonce);
    rlp_stream.append(&gas_price);
    rlp_stream.append(&gas_limit);
    rlp_stream.append(&token_bytes);              // to = token contract
    rlp_stream.append(&0u64);                     // value = 0 (no native AVAX)
    rlp_stream.append(&calldata);                 // data = transfer() calldata
    rlp_stream.append(&crate::config::AVALANCHE_CHAIN_ID);
    rlp_stream.append(&0u8);                      // r = 0 for unsigned tx
    rlp_stream.append(&0u8);                      // s = 0 for unsigned tx

    let unsigned_tx_bytes = rlp_stream.out().to_vec();

    // Step 7: Hash the transaction with keccak256
    let tx_hash = keccak256(&unsigned_tx_bytes);

    // Step 8: Sign the transaction hash with threshold ECDSA
    let signature = sign_with_ecdsa(&tx_hash).await?;

    // Step 9: Extract r, s, v from signature
    let (r, s, v) = extract_signature_components(&signature, crate::config::AVALANCHE_CHAIN_ID)?;

    // Step 10: Build the final signed transaction
    let mut signed_rlp = RlpStream::new();
    signed_rlp.begin_list(9);
    signed_rlp.append(&nonce);
    signed_rlp.append(&gas_price);
    signed_rlp.append(&gas_limit);
    signed_rlp.append(&token_bytes);              // to = token contract
    signed_rlp.append(&0u64);                     // value = 0
    signed_rlp.append(&calldata);                 // data = transfer() calldata
    signed_rlp.append(&v);
    signed_rlp.append(&r);
    signed_rlp.append(&s);

    let signed_tx_bytes = signed_rlp.out().to_vec();

    // Step 11: Convert to hex string with 0x prefix
    Ok(format!("0x{}", hex::encode(signed_tx_bytes)))
}

/// Get the Ethereum address derived from our ECDSA public key
pub async fn get_eth_address() -> Result<String, String> {
    let key_id = EcdsaKeyId {
        curve: EcdsaCurve::Secp256k1,
        name: ECDSA_KEY_NAME.to_string(),
    };

    let request = EcdsaPublicKeyArgs {
        canister_id: None,
        derivation_path: vec![],
        key_id: key_id.clone(),
    };

    let response = ecdsa_public_key(&request)
        .await
        .map_err(|e| format!("Failed to get ECDSA public key: {:?}", e))?;

    // The public key is 65 bytes: 0x04 || x || y
    // For Ethereum address: keccak256(x || y) and take last 20 bytes
    let public_key = &response.public_key;
    if public_key.len() != 65 || public_key[0] != 0x04 {
        return Err("Invalid public key format".to_string());
    }

    // Hash the x and y coordinates (skip the 0x04 prefix)
    let hash = keccak256(&public_key[1..]);

    // Take the last 20 bytes as the Ethereum address
    let address_bytes = &hash[12..];
    Ok(format!("0x{}", hex::encode(address_bytes)))
}

/// Get transaction count (nonce) for an Ethereum address
async fn get_transaction_count(address: &str) -> Result<u64, String> {
    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_getTransactionCount".to_string(),
        params: serde_json::to_string(&vec![
            serde_json::json!(address),
            serde_json::json!("latest"),
        ])
        .unwrap(),
        id: 3,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("EVM RPC call failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("RPC error {}: {}", error.code, error.message));
    }

    let nonce_hex = response
        .result
        .and_then(|r| serde_json::from_str::<serde_json::Value>(&r).ok())
        .and_then(|r| r.as_str().map(String::from))
        .ok_or_else(|| "No nonce returned".to_string())?;

    let nonce_str = nonce_hex.strip_prefix("0x").unwrap_or(&nonce_hex);
    u64::from_str_radix(nonce_str, 16).map_err(|e| format!("Failed to parse nonce: {}", e))
}

/// Sign a message hash with threshold ECDSA
pub async fn sign_with_ecdsa(message_hash: &[u8]) -> Result<Vec<u8>, String> {
    let key_id = EcdsaKeyId {
        curve: EcdsaCurve::Secp256k1,
        name: ECDSA_KEY_NAME.to_string(),
    };

    let request = SignWithEcdsaArgs {
        message_hash: message_hash.to_vec(),
        derivation_path: vec![],
        key_id,
    };

    let response = mgmt_sign_with_ecdsa(&request)
        .await
        .map_err(|e| format!("Failed to sign with ECDSA: {:?}", e))?;

    Ok(response.signature)
}

/// Extract r, s, v components from ECDSA signature for Ethereum
fn extract_signature_components(
    signature: &[u8],
    chain_id: u64,
) -> Result<(Vec<u8>, Vec<u8>, u64), String> {
    // ECDSA signature is 64 bytes: r (32 bytes) || s (32 bytes)
    if signature.len() != 64 {
        return Err(format!(
            "Invalid signature length: expected 64, got {}",
            signature.len()
        ));
    }

    let r = signature[0..32].to_vec();
    let s = signature[32..64].to_vec();

    // For EIP-155, v = chain_id * 2 + 35 + recovery_id
    // Recovery ID is typically 0 or 1, we'll use 0 for now
    // In production, you'd need to calculate the correct recovery ID
    let recovery_id = 0u64;
    let v = chain_id * 2 + 35 + recovery_id;

    Ok((r, s, v))
}

/// Get the ERC-20 token balance for a wallet address
pub async fn get_token_balance(wallet_address: &str) -> Result<u64, String> {
    // Anvil mock: return fake balance in local dev
    if crate::config::NETWORK_NAME == "anvil" {
        ic_cdk::print(format!("ANVIL_MOCK: get_token_balance for {}", wallet_address));
        return Ok(1000);
    }

    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    // ABI encode balanceOf(address): selector 0x70a08231 + 32-byte padded address
    let addr_hex = wallet_address.strip_prefix("0x").unwrap_or(wallet_address);
    let data = format!("0x70a08231{:0>64}", addr_hex);

    let call_params = serde_json::json!([
        { "to": crate::config::TRESR_TOKEN_CONTRACT, "data": data },
        "latest"
    ]);

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_call".to_string(),
        params: serde_json::to_string(&call_params).unwrap(),
        id: 1,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("EVM RPC call failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("RPC error {}: {}", error.code, error.message));
    }

    let result_hex = response.result
        .ok_or_else(|| "No result from eth_call".to_string())?;

    // Parse hex string — result is a raw hex-encoded uint256
    let hex_str = result_hex.trim().trim_matches('"');
    let hex_clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    if hex_clean.is_empty() || hex_clean.chars().all(|c| c == '0') {
        return Ok(0);
    }

    let wei = BigUint::parse_bytes(hex_clean.as_bytes(), 16)
        .ok_or_else(|| format!("Failed to parse balance hex: {}", hex_clean))?;
    let one_token = BigUint::from(10u64).pow(18);
    let tokens = &wei / &one_token;
    tokens.to_u64().ok_or_else(|| "Balance too large for u64".to_string())
}

/// Get current gas price from the network
pub async fn get_gas_price() -> Result<u64, String> {
    if crate::config::NETWORK_NAME == "anvil" {
        return Ok(DEFAULT_GAS_PRICE);
    }

    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_gasPrice".to_string(),
        params: "[]".to_string(),
        id: 1,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("eth_gasPrice failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("RPC error {}: {}", error.code, error.message));
    }

    let hex = response.result.ok_or("No gas price returned")?;
    let hex_str = hex.trim().trim_matches('"');
    let clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    u64::from_str_radix(clean, 16).map_err(|e| format!("Failed to parse gas price: {}", e))
}

/// Estimate gas for a transaction
pub async fn estimate_gas(from: &str, to: &str, data: &str, value: Option<&str>) -> Result<u64, String> {
    if crate::config::NETWORK_NAME == "anvil" {
        return Ok(65_000);
    }

    let evm_rpc_id = Principal::from_text(crate::config::EVM_RPC_CANISTER_ID)
        .map_err(|e| format!("Invalid EVM RPC canister ID: {:?}", e))?;

    let mut tx = serde_json::json!({ "from": from, "to": to, "data": data });
    if let Some(v) = value {
        tx["value"] = serde_json::json!(v);
    }

    let request = RpcRequest {
        jsonrpc: "2.0".to_string(),
        method: "eth_estimateGas".to_string(),
        params: serde_json::to_string(&vec![tx]).unwrap(),
        id: 1,
    };

    let (response,): (RpcResponse,) = call(evm_rpc_id, "request", (request, crate::config::AVALANCHE_CHAIN_ID))
        .await
        .map_err(|(code, msg)| format!("eth_estimateGas failed: {:?}: {}", code, msg))?;

    if let Some(error) = response.error {
        return Err(format!("RPC error {}: {}", error.code, error.message));
    }

    let hex = response.result.ok_or("No gas estimate returned")?;
    let hex_str = hex.trim().trim_matches('"');
    let clean = hex_str.strip_prefix("0x").unwrap_or(hex_str);
    u64::from_str_radix(clean, 16).map_err(|e| format!("Failed to parse gas estimate: {}", e))
}

/// Compute keccak256 hash of data
pub fn keccak256(data: &[u8]) -> Vec<u8> {
    let mut hasher = Keccak::v256();
    let mut output = [0u8; 32];
    hasher.update(data);
    hasher.finalize(&mut output);
    output.to_vec()
}
