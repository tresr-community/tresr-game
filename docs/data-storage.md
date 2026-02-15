# Juno Data Storage Reference

> Source of truth for all Juno Datastore collections and Storage buckets
> used by the Tresr satellite.

## Datastore Collections

### `users` — User Profiles

|               |                                     |
| ------------- | ----------------------------------- |
| **Read**      | `managed` (owner + satellite only)  |
| **Write**     | `managed`                           |
| **Memory**    | `stable`                            |
| **Key**       | User's principal ID (text)          |
| **Rust type** | `UserProfile` in `types.rs`         |
| **TS type**   | `UserProfile` in `types/backend.ts` |

Contains: nickname, login method, game stats (`UserStats`), wallet info
(`UserWallet`), preferences, EVM wallet address + verification
signature, ban status (`banned_until`, `offence_count`), notifications
array.

**Hooks:**

- `assert_set_doc` → validates EVM wallet format, verifies wallet
  signature
- `on_set_doc` → syncs sanitized entry to `leaderboard` collection

---

### `fees` — Fee Transaction Verification

|               |                                                    |
| ------------- | -------------------------------------------------- |
| **Read**      | `managed`                                          |
| **Write**     | `managed`                                          |
| **Key**       | EVM transaction hash (enforced == `tx_hash` field) |
| **Rust type** | `FeeRequest` in `types.rs`                         |

Contains: `tx_hash`, `amount` (tokens), `status` (pending → verified /
failed), `verified_at`, `error`.

**Hooks:**

- `assert_set_doc` → validates tx hash format (0x + 64 hex), enforces
  key == tx_hash (prevents replay), requires pending status
- `on_set_doc` → calls `verify_avalanche_fee()` via EVM RPC, validates
  `tx.from` matches caller's linked wallet, credits balance to user
  profile, updates global stats (total_fees, total_burned)

---

### `claims` — Reward Claims

|               |                              |
| ------------- | ---------------------------- |
| **Read**      | `managed`                    |
| **Write**     | `managed`                    |
| **Key**       | Auto-generated UUID          |
| **Rust type** | `ClaimRequest` in `types.rs` |

Contains: `amount`, `status` (pending → ready_for_chain → completed /
failed), `signature` (ECDSA from IC threshold signing), `tx_hash` (EVM
claim tx), `game_session_id`, `keys_collected`, `claim_type`, `error`.

**Claim types:** `"boss_kill"` (default — player defeated the boss) or
`"consolation"` (decaying high score prize).

**Hooks:**

- `assert_set_doc` → validates game session link, status, amount > 0
- `on_set_doc` → generates claim signature (pending), verifies claim
  tx (ready_for_chain), updates global stats (total_rewarded)

---

### `game_sessions` — Game Session Records

|               |                             |
| ------------- | --------------------------- |
| **Read**      | `managed`                   |
| **Write**     | `managed`                   |
| **Key**       | Session UUID                |
| **Rust type** | `GameSession` in `types.rs` |

Contains: `started_at`, `ended_at`, `keys_collected`, `boss_defeated`,
`score`, `reward_claimed`.

**Hooks:**

- `assert_set_doc` → validates start time, max keys check
- `on_set_doc` → logs boss victories

---

### `leaderboard` — Public Leaderboard (Active + All-Time)

|               |                                           |
| ------------- | ----------------------------------------- |
| **Read**      | `public` (no auth required)               |
| **Write**     | `managed` (satellite only)                |
| **Key**       | User's principal ID (same as `users` key) |
| **Rust type** | `LeaderboardEntry` in `types.rs`          |

Contains two sets of data per player:

- **All-time:** `nickname`, `high_score` (personal best, never expires),
  `games_won`
- **Active (decaying):** `active_score`, `scored_at`, `expires_at`
  (24h TTL), `session_id`

One document per player. `high_score` only increases. `active_score` is
overwritten each game session with a fresh 24h expiry.

**Written by:** `on_set_doc("users")` hook and `on_game_session_update`.

**UI tabs:**

- 🔥 ACTIVE — filters `expires_at > now`, sorts by `active_score`
- 🏆 ALL TIME — no filter, sorts by `high_score`

---

### `stats` — Global Statistics

|               |                              |
| ------------- | ---------------------------- |
| **Read**      | `public`                     |
| **Write**     | `managed` (satellite only)   |
| **Key**       | `"global"` (single document) |
| **Rust type** | `GlobalStats` in `types.rs`  |

Contains: `total_fees`, `total_burned`, `total_rewarded`.

**Written by:** `update_global_stats()` helper called from fee
verification and claim completion hooks.

---

### `balance_refresh` — On-Chain Balance Sync

|               |                                       |
| ------------- | ------------------------------------- |
| **Read**      | `managed`                             |
| **Write**     | `managed`                             |
| **Key**       | User's principal ID                   |
| **Rust type** | `BalanceRefreshRequest` in `types.rs` |

Contains: `evm_wallet`, `status` (pending → completed / failed),
`balance`, `error`.

**Hooks:**

- `on_set_doc` → calls `get_token_balance()` via EVM RPC

---

## Storage Buckets

### `images` — Public Assets

|            |           |
| ---------- | --------- |
| **Read**   | `public`  |
| **Write**  | `managed` |
| **Memory** | `stable`  |

General-purpose image storage (avatars, game assets).

---

## Collection Map

```text
┌─────────────────────────────────────────────────────┐
│                    DATASTORE                        │
├──────────────────┬──────────┬───────────────────────┤
│ Collection       │ Access   │ Written By            │
├──────────────────┼──────────┼───────────────────────┤
│ users            │ managed  │ client + hooks        │
│ fees             │ managed  │ client → hook verif.  │
│ claims           │ managed  │ client → hook signing │
│ game_sessions    │ managed  │ client + hooks        │
│ leaderboard      │ public   │ hook (from users/game)│
│ stats            │ public   │ hook (from fees/claims)│
│ balance_refresh  │ managed  │ client → hook RPC     │
├──────────────────┴──────────┴───────────────────────┤
│                    STORAGE                          │
├──────────────────┬──────────┬───────────────────────┤
│ images           │ public   │ managed               │
└──────────────────┴──────────┴───────────────────────┘
```
