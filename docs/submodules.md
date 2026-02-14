# Submodules Management

This document provides instructions for managing Git submodules in the Tresr game project.

The project uses **Foundry** (`forge`) for Solidity development. Foundry manages dependencies as Git submodules under `contracts/lib/`.

## How Foundry Pins Dependencies

Foundry pins dependencies by **commit SHA recorded in the Git index** — not by a version field in `.gitmodules` or any lockfile:

- `.gitmodules` only stores the repo URL and local path
- The actual version is the commit SHA that Git records when you `git add` a submodule path
- When collaborators clone and run `git submodule update --init --recursive`, they get the exact same commit

> [!IMPORTANT]
> The `branch` field in `.gitmodules` is for `git submodule update --remote`
> and expects a **branch name**, not a tag. Since releases are tags (e.g. `v5.5.0`),
> don't use `branch` for pinning — use the commit SHA approach below.

## Current Dependencies

| Submodule                                                                                                | Version | Path                                               |
| -------------------------------------------------------------------------------------------------------- | ------- | -------------------------------------------------- |
| [openzeppelin-contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)                         | v5.5.0  | `contracts/lib/openzeppelin-contracts`             |
| [openzeppelin-contracts-upgradeable](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable) | v5.5.0  | `contracts/lib/openzeppelin-contracts-upgradeable` |
| [forge-std](https://github.com/foundry-rs/forge-std)                                                     | v1.14.0 | `contracts/lib/forge-std`                          |

## Cloning the Repo (First Time)

After cloning the repository, initialize and clone all submodules (including nested ones):

```bash
git submodule update --init --recursive
```

## Installing a New Dependency

Use `forge install` with the `@tag` syntax to pin to a specific release:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.5.0
```

This automatically:

1. Clones the repo into `lib/`
2. Checks out the tag
3. Stages the submodule (records the commit SHA in the index)
4. Updates `.gitmodules`

## Updating a Dependency to a New Release

```bash
cd contracts

# Option 1: Re-install at a specific tag
forge install OpenZeppelin/openzeppelin-contracts@v5.6.0

# Option 2: Manual checkout + stage
cd lib/openzeppelin-contracts
git fetch --tags
git checkout v5.6.0
cd ../..
git add lib/openzeppelin-contracts
```

After updating, commit the changes:

```bash
cd ..  # back to repo root
git add contracts/lib/
git commit -m "chore: update openzeppelin-contracts to v5.6.0"
```

> [!WARNING]
> **Do not use `git submodule update --remote`** for updating to a specific release. It tracks the latest commit on a remote branch, not a tag. Use `forge install @tag` or manual `git checkout` instead.

## Recursive Submodules

Some dependencies (e.g. `openzeppelin-contracts-upgradeable`) have their own nested submodules. After changing a submodule version, always initialize nested submodules:

```bash
cd contracts/lib/openzeppelin-contracts-upgradeable
git submodule update --init --recursive
```

## Troubleshooting

### Reset all submodules to indexed state

```bash
git submodule foreach --recursive git checkout .
git submodule foreach --recursive git clean -fd
git submodule update --init --recursive
```

### Nuclear option (wipe and re-clone)

```bash
git submodule foreach --recursive 'git clean -ffd'
git submodule update --init --recursive
```

### "Revision mismatch" warnings from Forge

These appear when the submodule commit differs from what Forge previously cached. They go away after committing the updated submodule SHAs.

## Notes

- Avoid modifying files within submodules directly
- Always commit submodule updates (`git add contracts/lib/`) so collaborators get the same versions
- For more on Git submodules, see the [official Git documentation](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
