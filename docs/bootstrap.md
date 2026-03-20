# Bootstrap Guide

> **When to use this:** First-time deployment into a fresh environment (all
> contract addresses are `0x0` in `config/tresr.yaml`). After the bootstrap
> completes, use the normal `cd-testnet.yaml` / `cd-mainnet.yaml` pipelines for all subsequent
> deployments.

---

## Why Bootstrap Exists

The application has a hard dependency triangle that prevents a cold-start
with a single normal CD run:

```text
Satellite canister → oracle address (from canister + ECDSA key)
        ↓
Vault constructor (requires oracle at deploy time)
        ↓
vault_contract address → tresr.yaml → satellite reads at deploy time
```

The `bootstrap.yaml` pipeline resolves this by sequencing everything in a
single run and wiring the oracle directly between Juno and the contracts —
no in-between config PR required.

---

## Pre-requisites

Before running the bootstrap you need:

1. **A deployed satellite canister** on the target network.
   The canister ID must already be in `config/tresr.yaml` (testnet or mainnet
   section) and in the matching GitHub Environment variable
   (`vars.VITE_SATELLITE_ID`).

2. **Juno OIDC** configured in the [Juno Console](https://console.juno.build/) to grants permissions to the GitHub Actions workflow.

3. **A funded deployer account** for the Avalanche network:
   - `secrets.DEPLOYER_PRIVATE_KEY` — the EOA that deploys contracts.
   - `secrets.SNOWTRACE_API_KEY` — for contract verification.
   - `secrets.PUBLIC_WALLETCONNECT_PROJECT_ID` — for reown walletconnect project ID.

4. **GitHub Environment variables**:
   - `vars.FOUNDRY_PROFILE` — the foundry profile to use (testnet or mainnet).
   - `vars.VITE_SITE_URL` — the deployed SvelteKit site URL.
   - `vars.VITE_ORBITER_ID` — the deployed Orbiter ID.
   - `vars.VITE_SIWA_PROVIDER_ID` — the deployed Siwa provider ID.
   - `vars.VITE_SATELLITE_ID` — the deployed satellite canister ID.

5. **All contract addresses zeroed** in `config/tresr.yaml`:

   ```yaml
   # config/tresr.yaml – testnet section
   avalanche:
     testnet:
       oracle_address: "0x0000000000000000000000000000000000000000"
       tresr_token_contract: "0x0000000000000000000000000000000000000000"
       vault_contract: "0x0000000000000000000000000000000000000000"
       faucet_contract: "0x0000000000000000000000000000000000000000"
   ```

_**NOTE**: The workflow will abort if any of these are already set. This is a
safety guard to prevent accidental re-bootstrap of a live environment._

---

## How to Trigger

1. Open **Actions → Bootstrap Environment** in GitHub.
2. Click **Run workflow**.
3. Select the target environment: `Testnet` or `Mainnet`.
4. Type `bootstrap` in the confirmation field (exact text required).
5. Click **Run workflow**.

_That's it. The pipeline takes ~20–30 minutes to complete._

---

## What the Pipeline Does

Everything runs in a **single job** on one runner — no redundant setup steps:

```text
bootstrap (single job)
  ├─ guard: verify confirmation + all addresses are 0x0
  ├─ setup: checkout + devenv (1×)
  │
  ├─ Juno Pass 1 (deploy-juno action — no vault yet)
  │   ├─ build frontend
  │   ├─ deploy functions to satellite
  │   ├─ deploy hosting to satellite
  │   └─ get_oracle_address from satellite → captures oracle
  │
  ├─ deploy contracts (oracle injected from Pass 1)
  │   ├─ foundry-resolve-token → deploys Token + Faucet (testnet only)
  │   └─ foundry-resolve-vault → deploys Vault with oracle ✅
  │
  └─ patch config + Juno Pass 2
      ├─ update-tresr-config → patches tresr.yaml, opens config PR
      ├─ build frontend (now includes vault address)
      └─ juno deploy → re-deploys hosting (Pass 2 — with vault) ✅
```

After the pipeline completes:

- Juno satellite is fully deployed and aware of the vault.
- All contracts (Token, Faucet, Vault) are live on Avalanche.
- A PR is raised against `trunk` with the addresses written to
  `config/tresr.yaml`.

---

## After the Pipeline: Merge the PR

The final step is to merge the auto-generated config PR. This persists the
deployed addresses to the repository so future CD runs don't re-deploy
unchanged contracts.

**Why a PR and not a direct commit?** The addresses are committed via a PR
so they go through code review and any branch protection checks, keeping the
audit trail clean.

Once merged, `config/tresr.yaml` will contain all four addresses. From this
point, the normal `cd-testnet.yaml` / `cd-mainnet.yaml` pipelines handle all future releases.

---

## Subsequent Releases

After bootstrap, use the normal release pipeline. Contracts will **not** be
re-deployed unless their bytecode changes — the `foundry-resolve-*` actions
compare on-chain bytecode against local artifacts and skip unchanged contracts.

```bash
# Normal release flow — NOT bootstrap
Actions → All Workflows → cd-testnet.yaml (or cd-mainnet.yaml) → Run workflow
```

---

## Troubleshooting

### Guard fails: "address already set"

The target environment has at least one non-zero address. Do not run
bootstrap on a live environment. Check `config/tresr.yaml` and verify you
selected the correct environment.

### Juno deploy fails: "`get_oracle_address` not found"

The satellite WASM does not expose `get_oracle_address`. Ensure the deployed
satellite version includes the ECDSA oracle function. Check
`src/satellite/src/oracle.rs`.

### Vault deploy skipped or fails: "oracle = 0x0"

The `deploy-juno` job did not output a valid oracle address. Check the
**Oracle Address** step in that job's logs. The `deploy-contracts` job will
fail fast if oracle is empty.

### Config PR already open

There may be a stale `chore/update-testnet-contract-address` branch. Close the
old PR, delete the branch, and re-run. The `update-tresr-config` action checks
for an existing branch and will error if one already exists.

---

## Creating the Satellite (First Time)

If the satellite canister itself does not yet exist, you need to create it
before running the bootstrap pipeline.

1. **Via Juno Console (recommended):**
   - Go to [console.juno.build](https://console.juno.build) and sign in.
   - Click **Launch your first Satellite**.
   - Name it (e.g. `tresr-testnet`) and select _Application_.
   - Copy the generated Satellite ID.

2. **Update the repository:**
   - Add the Satellite ID to the appropriate GitHub Environment variable:
     `vars.VITE_SATELLITE_ID` (Testnet or Mainnet environment).
   - Ensure `config/tresr.yaml` has the matching satellite ID in its Juno
     section.

3. **Proceed with the bootstrap pipeline** as described above.

For local development the Juno emulator is used instead — see
`juno-dev start` and the local development guide.
