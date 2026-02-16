# Blockchain Integration

## EVM RPC Canister

The game uses DFINITY's EVM RPC canister to interact with Avalanche C-Chain:

- **Canister ID**: `7hfb6-caaaa-aaaar-qadga-cai`
- **Chain**: Avalanche C-Chain (ID: 43114)
- **Methods**: Transaction verification, balance checking, token transfers

## Token Flow

1. **Fee**: User sends tokens to game contract on Avalanche
2. **Verification**: Backend verifies transaction via EVM RPC
3. **Credit**: Balance updated in user profile
4. **Gameplay**: Player earns additional tokens through gameplay
5. **Claim**: User withdraws tokens to their Avalanche address
