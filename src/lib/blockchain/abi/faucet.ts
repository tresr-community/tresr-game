/**
 * Faucet Contract ABI
 *
 * Minimal ABI for the TresrFaucet contract on Avalanche C-Chain.
 * Used to claim free test tokens in non-production environments (local/testnet only).
 */

export const FaucetAbi = [
  // Claim tokens from the faucet
  {
    inputs: [],
    name: "drip",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Read current drip amount per claim
  {
    inputs: [],
    name: "dripAmount",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Read cooldown period in seconds between claims
  {
    inputs: [],
    name: "cooldown",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Read last drip timestamp for a given address
  {
    inputs: [{internalType: "address", name: "", type: "address"}],
    name: "lastDripTime",
    outputs: [{internalType: "uint256", name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
  // Drip event — emitted when a player claims tokens
  {
    anonymous: false,
    inputs: [
      {indexed: true, internalType: "address", name: "to", type: "address"},
      {
        indexed: false,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
    ],
    name: "Drip",
    type: "event",
  },
] as const;
