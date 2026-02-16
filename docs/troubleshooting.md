# Troubleshooting

## Common Issues

### "Satellite ID not configured"

- Run `juno dev` to create a satellite
- Copy ID to `.env` file
- Restart dev server

### "Failed to build satellite functions"

```bash
rustup target add wasm32-unknown-unknown
cargo clean
juno functions build
```

### "Module not found: declarations/satellite"

```bash
didc bind src/satellite/satellite.did -t ts > src/declarations/satellite/index.ts
```

### "EVM RPC call failed"

- Check canister ID: `7hfb6-caaaa-aaaar-qadga-cai`
- Verify sufficient cycles
- Test with Avalanche testnet first
