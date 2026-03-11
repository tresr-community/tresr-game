# Blockchain Integration

Trying to get 2 entire different blockchains to work together has been a challenging experience.

## Architecture

The architecture is;

- Internet Computer provides the hosting (compute)
- Avalanche is the _Identity_
- Avalanche is the _Economy_

This means we need to;

- Convert an Internet Identity Principal into Avalanche EVM address.
- Submit EVM transactions client-side using regular browser wallets.
- Verify EVM transactions across blockchains via the _EVM RPC Canister_ which acts sort of like a bridge between blockchains.

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
