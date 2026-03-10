# Economic Design

## Overview

The FOMO game loop.

The goal for the `TresrVault` is to create a self-sustaining economic flywheel where;

- players pay a $TRESR fee to play
- winners drain a portion of the vault
- and the cycle repeats.

No manual refilling should be required after the initial seed.

## The Flywheel

```mermaid
graph LR
    A[Players pay 100 TRESR fee] --> B[Vault gets fatter]
    B --> C[Difficulty scales UP]
    C --> D[More attempts needed = more fees]
    D --> B
    B --> E[Someone wins]
    E --> F[Vault halves, difficulty drops]
    F --> A
```

## Vault Tiers & Difficulty

All values denominated in whole $TRESR tokens (18 decimals).

| Tier           | Vault Balance    | Difficulty | Payout | Color     | Behaviour                               |
| -------------- | ---------------- | ---------- | ------ | --------- | --------------------------------------- |
| **LOCKED**     | < 1,000          | N/A        | N/A    | ⚫ Grey   | Paid mode disabled. "Vault recharging"  |
| **Building**   | 1,000 – 10,000   | 1.0x       | 500    | 🟢 Green  | Attracts players, vault refills quickly |
| **Sweet Spot** | 10,000 – 50,000  | 1.5x       | 10%    | 🟡 Yellow | Balanced gameplay                       |
| **FOMO**       | 50,000 – 100,000 | 2.0x       | 25%    | 🔴 Red    | FOMO zone: big prize, hard to claim     |
| **Legendary**  | > 100,000        | 3.0x       | 50%    | 🟣 Purple | Legendary territory                     |

### Difficulty Multiplier Effects

The multiplier adjusts (future implementation in satellite):

- Enemy health and damage
- Boss health and enrage threshold
- Enemy spawn rate

## Caps & Guards

| Parameter         | Value                 | Rationale                              |
| ----------------- | --------------------- | -------------------------------------- |
| Entry fee         | 100 TRESR             | Low barrier, steady inflow             |
| Burn rate         | 10% of fee            | Deflationary — 1 TRESR burned per play |
| Max claim         | 50% of vault          | Vault never fully drains               |
| Minimum claim     | 50 TRESR              | Prevents dust claims                   |
| Claim cooldown    | 1 hour (configurable) | Per-user limit, daily race mechanic    |
| Minimum vault cap | 500 TRESR             | Below this, paid mode is locked        |

## Win Economics Example

Starting vault: 100,000 TRESR

```text
Round 1: Player A wins → claims 50,000 → vault: 50,000
Round 2: Player B wins → claims 25,000 → vault: 25,000
Round 3: Player C wins → claims 12,500 → vault: 12,500
Round 4: Player D wins → claims  6,250 → vault:  6,250
Round 5: Player E wins → claims  3,125 → vault:  3,125
Round 6+: Fees accumulate, vault refills...
```

Meanwhile, every losing player paid 10 TRESR (9 to vault + 1 burned).

At 100 losing plays between wins, that's +900 TRESR back to the vault.

## Homepage UX

### Vault Balance (center, prominent)

- Animated counter showing current vault TRESR balance
- Difficulty badge next to it (🟢/🟡/🔴/🟣)
- Updates every 60 seconds via RPC polling

### Cooldown Timer

- Shows personal cooldown: "Next claim in 00:45:22" or "READY ✅"
- Only visible for authenticated, wallet-connected users

### START Button Lock

- When vault < 500 TRESR: START button disabled with "VAULT RECHARGING" label
- When user cooldown active: START button shows cooldown remaining

### Win Toast (FOMO)

- Listens for `Claim` events on-chain
- Shows toast: "🏆 0x1234...5678 just won 37,500 TRESR!"
- Auto-refreshes vault balance on win event

## Config Values

Added to `tresr.yaml` under `gameplay.vault`:

```yaml
vault:
  minimum_cap: 1000 # Below this, paid mode is locked
  tiers:
    building: 10000 # less than or equal to this number = "building"
    sweet_spot: 50000 # less than or equal to this number = "sweet_spot"
    fomo:
      100000 # less than or equal to this number = "fomo"
      # greater than 100,000 = legendary
  difficulty_multipliers:
    building: 1.0
    sweet_spot: 1.5
    fomo: 2.0
    legendary: 3.0
  payout_fixed:
    building: 500
  payout_percentages:
    sweet_spot: 10
    fomo: 25
    legendary: 50
```
