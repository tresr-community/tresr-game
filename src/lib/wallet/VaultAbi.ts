/**
 * Vault Contract ABI
 *
 * Complete ABI for the Tresr Vault contract on Avalanche C-Chain.
 * This is the single source of truth for all vault interactions.
 */

export const VaultAbi = [
  // Entry fee function - used when starting a game session
  {
    inputs: [
      {internalType: "uint256", name: "amount", type: "uint256"},
      {internalType: "bytes32", name: "sessionId", type: "bytes32"},
    ],
    name: "payFee",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Claim function - used when claiming rewards after winning
  {
    inputs: [
      {internalType: "bytes32", name: "sessionId", type: "bytes32"},
      {internalType: "uint256", name: "amount", type: "uint256"},
      {internalType: "uint256", name: "keys", type: "uint256"},
      {internalType: "bytes", name: "signature", type: "bytes"},
    ],
    name: "claim",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Balance query - get vault's total balance
  {
    inputs: [],
    name: "balanceOf",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Cooldown period in seconds
  {
    inputs: [],
    name: "claimCooldown",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Last claim timestamp per user (seconds since epoch)
  {
    inputs: [{internalType: "address", name: "", type: "address"}],
    name: "lastClaimTime",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Claim event — emitted when a player wins and claims rewards
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes32",
        name: "sessionId",
        type: "bytes32",
      },
      {indexed: true, internalType: "address", name: "user", type: "address"},
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "Claim",
    type: "event",
  },
] as const;

/**
 * ERC20 Token ABI (minimal)
 *
 * Minimal ABI for ERC20 token interactions (balance queries, approvals).
 */
export const ERC20Abi = [
  // Balance query
  {
    inputs: [{internalType: "address", name: "account", type: "address"}],
    name: "balanceOf",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Allowance query
  {
    inputs: [
      {internalType: "address", name: "owner", type: "address"},
      {internalType: "address", name: "spender", type: "address"},
    ],
    name: "allowance",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Approve spending
  {
    inputs: [
      {internalType: "address", name: "spender", type: "address"},
      {internalType: "uint256", name: "amount", type: "uint256"},
    ],
    name: "approve",
    outputs: [{internalType: "bool", name: "", type: "bool"}],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Transfer tokens
  {
    inputs: [
      {internalType: "address", name: "to", type: "address"},
      {internalType: "uint256", name: "amount", type: "uint256"},
    ],
    name: "transfer",
    outputs: [{internalType: "bool", name: "", type: "bool"}],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Decimals
  {
    inputs: [],
    name: "decimals",
    outputs: [{internalType: "uint8", name: "", type: "uint8"}],
    stateMutability: "view",
    type: "function",
  },
  // Symbol
  {
    inputs: [],
    name: "symbol",
    outputs: [{internalType: "string", name: "", type: "string"}],
    stateMutability: "view",
    type: "function",
  },
] as const;
