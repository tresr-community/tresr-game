//! Vendored types from `evm-rpc-canister-types` v5.0.1
//!
//! The upstream crate depends on `ic-cdk ^0.14` which conflicts with our
//! `ic-cdk 0.19`. The only runtime dependency is the inter-canister call
//! mechanism, which changed from `call_with_payment128` (0.14) to the builder
//! `Call` API (0.19). All Candid types are identical.
//!
//! Source: <https://github.com/letmejustputthishere/chain-fusion-starter>
//! License: Apache-2.0

#![allow(non_snake_case, clippy::large_enum_variant, dead_code)]

use candid::{self, CandidType, Deserialize, Principal};
use ic_cdk::call::Call;

// ============================================================================
// Primitive aliases
// ============================================================================

pub type Regex = String;
pub type ChainId = u64;
pub type ProviderId = u64;
pub type Topic = Vec<String>;

// ============================================================================
// Enums
// ============================================================================

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum LogFilter {
    ShowAll,
    HideAll,
    ShowPattern(Regex),
    HidePattern(Regex),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum EthSepoliaService {
    Alchemy,
    BlockPi,
    PublicNode,
    Ankr,
    Sepolia,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum L2MainnetService {
    Alchemy,
    Llama,
    BlockPi,
    PublicNode,
    Ankr,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum EthMainnetService {
    Alchemy,
    Llama,
    BlockPi,
    Cloudflare,
    PublicNode,
    Ankr,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum RpcServices {
    EthSepolia(Option<Vec<EthSepoliaService>>),
    BaseMainnet(Option<Vec<L2MainnetService>>),
    Custom {
        chainId: ChainId,
        services: Vec<RpcApi>,
    },
    OptimismMainnet(Option<Vec<L2MainnetService>>),
    ArbitrumOne(Option<Vec<L2MainnetService>>),
    EthMainnet(Option<Vec<EthMainnetService>>),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum ConsensusStrategy {
    Equality,
    Threshold { min: u8, total: Option<u8> },
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum BlockTag {
    Earliest,
    Safe,
    Finalized,
    Latest,
    Number(candid::Nat),
    Pending,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum ProviderError {
    TooFewCycles {
        expected: candid::Nat,
        received: candid::Nat,
    },
    InvalidRpcConfig(String),
    MissingRequiredProvider,
    ProviderNotFound,
    NoPermission,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum ValidationError {
    Custom(String),
    InvalidHex(String),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum RejectionCode {
    NoError,
    CanisterError,
    SysTransient,
    DestinationInvalid,
    Unknown,
    SysFatal,
    CanisterReject,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum HttpOutcallError {
    IcError {
        code: RejectionCode,
        message: String,
    },
    InvalidHttpJsonRpcResponse {
        status: u16,
        body: String,
        parsingError: Option<String>,
    },
}

#[allow(clippy::enum_variant_names)] // vendored upstream type — names cannot be changed
#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum RpcError {
    JsonRpcError(JsonRpcError),
    ProviderError(ProviderError),
    ValidationError(ValidationError),
    HttpOutcallError(HttpOutcallError),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum CallResult {
    Ok(String),
    Err(RpcError),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum RpcService {
    EthSepolia(EthSepoliaService),
    BaseMainnet(L2MainnetService),
    Custom(RpcApi),
    OptimismMainnet(L2MainnetService),
    ArbitrumOne(L2MainnetService),
    EthMainnet(EthMainnetService),
    Provider(ProviderId),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum MultiCallResult {
    Consistent(CallResult),
    Inconsistent(Vec<(RpcService, CallResult)>),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum GetTransactionCountResult {
    Ok(candid::Nat),
    Err(RpcError),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum MultiGetTransactionCountResult {
    Consistent(GetTransactionCountResult),
    Inconsistent(Vec<(RpcService, GetTransactionCountResult)>),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum GetTransactionReceiptResult {
    Ok(Option<TransactionReceipt>),
    Err(RpcError),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum MultiGetTransactionReceiptResult {
    Consistent(GetTransactionReceiptResult),
    Inconsistent(Vec<(RpcService, GetTransactionReceiptResult)>),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum SendRawTransactionStatus {
    Ok(Option<String>),
    NonceTooLow,
    NonceTooHigh,
    InsufficientFunds,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum SendRawTransactionResult {
    Ok(SendRawTransactionStatus),
    Err(RpcError),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum MultiSendRawTransactionResult {
    Consistent(SendRawTransactionResult),
    Inconsistent(Vec<(RpcService, SendRawTransactionResult)>),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum RequestResult {
    Ok(String),
    Err(RpcError),
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub enum RequestCostResult {
    Ok(candid::Nat),
    Err(RpcError),
}

// ============================================================================
// Structs
// ============================================================================

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct HttpHeader {
    pub value: String,
    pub name: String,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct RpcApi {
    pub url: String,
    pub headers: Option<Vec<HttpHeader>>,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct RpcConfig {
    pub responseConsensus: Option<ConsensusStrategy>,
    pub responseSizeEstimate: Option<u64>,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct JsonRpcError {
    pub code: i64,
    pub message: String,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct AccessListEntry {
    pub storageKeys: Vec<String>,
    pub address: String,
}

#[derive(CandidType, Deserialize, Debug, Clone, Default)]
pub struct TransactionRequest {
    pub to: Option<String>,
    pub gas: Option<candid::Nat>,
    pub maxFeePerGas: Option<candid::Nat>,
    pub gasPrice: Option<candid::Nat>,
    pub value: Option<candid::Nat>,
    pub maxFeePerBlobGas: Option<candid::Nat>,
    pub from: Option<String>,
    pub r#type: Option<String>,
    pub accessList: Option<Vec<AccessListEntry>>,
    pub nonce: Option<candid::Nat>,
    pub maxPriorityFeePerGas: Option<candid::Nat>,
    pub blobs: Option<Vec<String>>,
    pub input: Option<String>,
    pub chainId: Option<candid::Nat>,
    pub blobVersionedHashes: Option<Vec<String>>,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct CallArgs {
    pub transaction: TransactionRequest,
    pub block: Option<BlockTag>,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct GetTransactionCountArgs {
    pub address: String,
    pub block: BlockTag,
}

#[derive(CandidType, Deserialize, Debug, Clone, PartialEq)]
pub struct LogEntry {
    pub transactionHash: Option<String>,
    pub blockNumber: Option<candid::Nat>,
    pub data: String,
    pub blockHash: Option<String>,
    pub transactionIndex: Option<candid::Nat>,
    pub topics: Vec<String>,
    pub address: String,
    pub logIndex: Option<candid::Nat>,
    pub removed: bool,
}

#[derive(CandidType, Deserialize, Debug, Clone)]
pub struct TransactionReceipt {
    pub to: Option<String>,
    pub status: Option<candid::Nat>,
    pub transactionHash: String,
    pub blockNumber: candid::Nat,
    pub from: String,
    pub logs: Vec<LogEntry>,
    pub blockHash: String,
    pub r#type: String,
    pub transactionIndex: candid::Nat,
    pub effectiveGasPrice: candid::Nat,
    pub logsBloom: String,
    pub contractAddress: Option<String>,
    pub gasUsed: candid::Nat,
}

// ============================================================================
// EvmRpcCanister — adapted for ic-cdk 0.19 Call builder API
//
// Original used `call_with_payment128(principal, method, args, cycles)` from
// ic-cdk 0.14. In 0.19 this became:
//   Call::unbounded_wait(principal, method)
//       .with_args(args)
//       .with_cycles(cycles)
//       .await?
//       .candid::<ReturnType>()?
// ============================================================================

/// Result alias matching what the Call builder returns.
pub type CanisterCallResult<T> = Result<T, String>;

#[derive(Debug, Clone)]
pub struct EvmRpcCanister(pub Principal);

impl EvmRpcCanister {
    // -- typed multi-provider methods ----------------------------------------

    pub async fn eth_call(
        &self,
        arg0: RpcServices,
        arg1: Option<RpcConfig>,
        arg2: CallArgs,
        cycles: u128,
    ) -> CanisterCallResult<(MultiCallResult,)> {
        Call::unbounded_wait(self.0, "eth_call")
            .with_args(&(arg0, arg1, arg2))
            .with_cycles(cycles)
            .await
            .map_err(|e| format!("{e:?}"))?
            .candid::<(MultiCallResult,)>()
            .map_err(|e| format!("{e:?}"))
    }

    pub async fn eth_get_transaction_count(
        &self,
        arg0: RpcServices,
        arg1: Option<RpcConfig>,
        arg2: GetTransactionCountArgs,
        cycles: u128,
    ) -> CanisterCallResult<(MultiGetTransactionCountResult,)> {
        Call::unbounded_wait(self.0, "eth_getTransactionCount")
            .with_args(&(arg0, arg1, arg2))
            .with_cycles(cycles)
            .await
            .map_err(|e| format!("{e:?}"))?
            .candid::<(MultiGetTransactionCountResult,)>()
            .map_err(|e| format!("{e:?}"))
    }

    pub async fn eth_get_transaction_receipt(
        &self,
        arg0: RpcServices,
        arg1: Option<RpcConfig>,
        arg2: String,
        cycles: u128,
    ) -> CanisterCallResult<(MultiGetTransactionReceiptResult,)> {
        Call::unbounded_wait(self.0, "eth_getTransactionReceipt")
            .with_args(&(arg0, arg1, arg2))
            .with_cycles(cycles)
            .await
            .map_err(|e| format!("{e:?}"))?
            .candid::<(MultiGetTransactionReceiptResult,)>()
            .map_err(|e| format!("{e:?}"))
    }

    pub async fn eth_send_raw_transaction(
        &self,
        arg0: RpcServices,
        arg1: Option<RpcConfig>,
        arg2: String,
        cycles: u128,
    ) -> CanisterCallResult<(MultiSendRawTransactionResult,)> {
        Call::unbounded_wait(self.0, "eth_sendRawTransaction")
            .with_args(&(arg0, arg1, arg2))
            .with_cycles(cycles)
            .await
            .map_err(|e| format!("{e:?}"))?
            .candid::<(MultiSendRawTransactionResult,)>()
            .map_err(|e| format!("{e:?}"))
    }

    // -- single-provider raw JSON-RPC request --------------------------------

    pub async fn request(
        &self,
        arg0: RpcService,
        arg1: String,
        arg2: u64,
        cycles: u128,
    ) -> CanisterCallResult<(RequestResult,)> {
        Call::unbounded_wait(self.0, "request")
            .with_args(&(arg0, arg1, arg2))
            .with_cycles(cycles)
            .await
            .map_err(|e| format!("{e:?}"))?
            .candid::<(RequestResult,)>()
            .map_err(|e| format!("{e:?}"))
    }
}
