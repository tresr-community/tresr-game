# Security

## Best Practices

- Never hardcode private keys or principals
- All backend calls require authentication
- Admin functions protected by role-based access control
- Input validation on all user data
- Secure token transaction verification
- Hermetic development environment via devenv

## Access Control

The backend implements role-based access control:

```rust
// User level - requires authentication
pub fn assert_authenticated() -> Result<(), String>

// Admin level - requires admin principal
pub fn assert_admin() -> Result<(), String>
```

Set admin principal in `src/satellite/src/lib.rs`.
