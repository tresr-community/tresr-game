# Juno Data Storage Reference

> Source of truth for all Juno Datastore collections and Storage buckets
> used by the Tresr satellite.

## Datastore Collections

### `audit` — Audit Logs

|            |                                  |
| ---------- | -------------------------------- |
| **Read**   | `managed` (admin only)           |
| **Write**  | `managed`                        |
| **Memory** | `stable`                         |
| **Key**    | Auto-generated UUID or custom ID |

Private admin collection for auditing blockchain transactions mapped to users.

---

### `claims` — Reward Claims

|               |                              |
| ------------- | ---------------------------- |
| **Read**      | `managed`                    |
| **Write**     | `managed`                    |
| **Memory**    | `stable`                     |
| **Key**       | Auto-generated UUID          |
| **Rust type** | `ClaimRequest` in `types.rs` |

Private collection for tracking user reward claims on the blockchain.

---

### `errors` — Error Tracking

|               |                             |
| ------------- | --------------------------- |
| **Read**      | `managed` (admin only)      |
| **Write**     | `managed`                   |
| **Memory**    | `stable`                    |
| **Key**       | `err_{timestamp_ns}`        |
| **Rust type** | `ErrorRecord` in `types.rs` |

Private admin-only collection for error tracking. Satellite functions write here; clients cannot read or write directly.

---

### `scores` — Public Leaderboard & Top Scorer

|               |                                  |
| ------------- | -------------------------------- |
| **Read**      | `public`                         |
| **Write**     | `managed` (satellite only)       |
| **Memory**    | `stable`                         |
| **Key**       | User's principal ID              |
| **Rust type** | `LeaderboardEntry` in `types.rs` |

Public collection for leaderboard entries per user and the top_scorer cache.

---

### `users` — User Profiles

|               |                                     |
| ------------- | ----------------------------------- |
| **Read**      | `managed` (owner + satellite only)  |
| **Write**     | `managed`                           |
| **Memory**    | `stable`                            |
| **Key**       | User's principal ID (text)          |
| **Rust type** | `UserProfile` in `types.rs`         |
| **TS type**   | `UserProfile` in `types/backend.ts` |

Private collection for per-user preferences (nickname, avatar, wallet, settings).

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

```mermaid
block-beta
  columns 3
  block:ds["DATASTORE"]:
    A["audit\n──────\naccess: managed\nwriter: satellite"]
    B["claims\n──────\naccess: managed\nwriter: client → hook"]
    C["errors\n──────\naccess: managed\nwriter: satellite"]
    D["scores\n──────\naccess: public\nwriter: hook (game)"]
    E["users\n──────\naccess: managed\nwriter: client + hooks"]
  end
  block:st["STORAGE"]:
    F["images\n──────\naccess: public\nwriter: managed"]
  end
```
