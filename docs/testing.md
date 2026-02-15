# Testing

## Frontend Testing

```bash
# Run tests
bun test

# Run with coverage
bun test --coverage
```

## Backend Testing

```bash
# Run Rust tests
cargo test --manifest-path src/satellite/Cargo.toml
```

## Manual Testing Checklist

- [ ] Internet Identity login works
- [ ] Guest mode works
- [ ] Profile creation and updates
- [ ] Game controls responsive
- [ ] Progress saves correctly
- [ ] High scores update
- [ ] Fee verification (testnet)
- [ ] Withdrawal sending (testnet)
