# Auth System Overview

High-level operational overview of the Brava auth system — who the actors are,
what they can do, and how the contracts enforce it.

## Actors

### Safe Owner (Custodian)

The Safe owner is typically an institutional custodian or the end user who
deployed the Safe. They hold the Safe's signing key and have ultimate authority:

- Full control over auth configuration (managers, co-signers, thresholds)
- Can execute any sequence of actions without co-signing requirements
- Signs one chain-agnostic auth config that any relayer can apply on any chain
- Can withdraw funds via the EmergencyWithdrawModule at any time

The owner does **not** perform day-to-day DeFi operations. Their role is setup,
oversight, and emergency recovery.

### Manager

A manager is an address authorised by the owner to execute DeFi operations on
the Safe. In the typical deployment, managers are backend relayer keys operated
by Brava on behalf of the custodian.

- Executes sequences (supply, withdraw, swap, bridge, etc.) via signed bundles
- May require co-signer approval depending on the threshold set by the owner
- Can be scoped to specific action types (e.g. only supply/withdraw, not swaps)
- **Cannot** modify auth config — only an owner-signed AuthBundle can
- At most one manager signature per bundle (enforced by the module)

### Co-signer

A co-signer provides a secondary approval layer for manager-signed bundles.
The owner sets a threshold (e.g. 1-of-3 co-signers required). Co-signers alone
cannot authorise a bundle — they exist solely to co-sign alongside a manager.

- Adds a check on manager operations (the custodian or a compliance key)
- Threshold is configurable per Safe: 0 means managers operate freely
- Co-signers do not need to be present for owner-signed bundles

## Intended Operational Flow

### 1. Safe Setup

The owner (or the Brava relayer on behalf of the owner) deploys a Safe via
`SafeDeployment`. The Safe is created with the owner as the sole signer
(threshold=1) and the EIP-712 module and EmergencyWithdrawModule enabled.

### 2. Auth Configuration

The owner signs an EIP-712 `AuthBundle` — separate from execution bundles —
carrying a complete auth config snapshot:

- **Managers** — addresses that will execute day-to-day operations
- **Co-signers** — addresses required to co-approve manager bundles
- **Co-sign threshold** — how many co-signers a manager bundle needs
- **Manager restrictions** (optional) — per-manager action type limits

Any relayer submits the signed bundle to `AuthRegistry.applyAuthBundle` — the
registry's **single write path**. The signature, not the caller, carries the
authority. Auth state is stored in the `AuthRegistry`, not in the module, so it
survives module upgrades.

Cross-chain propagation is by construction: the AuthBundle's EIP-712 domain
binds to the **Safe** (chainId fixed at 1), not to any chain or contract
deployment, so the same signed payload is relayable on every chain — including
chains added after signing. Auth config never travels over a bridge; CCTP
messages carry no auth data.

If the Safe is not yet deployed on a chain, ownership is proven by matching the
signer's deterministic CREATE2 Safe address, so auth config can land before the
Safe lazily deploys during its first bundle execution.

### 3. Day-to-Day Operations

The manager constructs bundles containing DeFi sequences (e.g. "supply USDC to
Aave on Ethereum, withdraw DAI from Morpho on Base"). The bundle is signed by
the manager and, if required, by enough co-signers to meet the threshold.

The module validates:

1. **Signatures** — packed 65-byte ECDSA sigs, sorted by address ascending
2. **Signer classification** — owner > co-signer > manager (priority order)
3. **Thresholds** — manager bundles need `managerCoSignThreshold` co-signatures
4. **Manager restrictions** — each action's `actionType` is checked against the
   manager's allowed bitmap (zero bitmap = unrestricted)
5. **Action validity** — each action ID must exist in AdminVault and match the
   declared `protocolName` and `actionType`
6. **Nonce** — per-Safe monotonic nonce prevents replay
7. **Reentrancy** — `executeBundle` is `nonReentrant`; a bundle cannot be
   re-entered mid-sequence within the same transaction

### 4. Auth Updates

Only the **owner** can update auth config, by signing a new `AuthBundle` with a
higher version number and having it relayed to `applyAuthBundle`. Execution
bundles cannot carry auth updates — the two signing flows are fully separate.

### 5. Manager Restrictions

Managers can optionally be restricted to specific action types. The owner sets
per-manager restrictions as part of the auth config:

```
Manager A: unrestricted (bitmap = 0)
Manager B: can only execute SUPPLY_ACTION and WITHDRAW_ACTION
Manager C: can only execute SWAP_ACTION
```

The module enforces restrictions at execution time. If a restricted manager's
bundle contains an action type not in their bitmap, the transaction reverts.
Unrestricted managers (no entry or bitmap=0) can execute any action type.

### 6. Cross-Chain Operations

Bundles are multi-chain by design. A single signed bundle can contain sequences
for Ethereum, Base, Arbitrum, etc. The signer signs once; the relayer submits
the bundle on each target chain. The module picks the sequence matching
`block.chainid` and the Safe's current nonce.

For fund movement between chains, the CCTP bridge actions handle Circle's
cross-chain transfer protocol. The destination entry point is
`CCTPBundleReceiver`: a permissionless relay mints the attested USDC to the
Safe and best-effort executes a separately-signed bundle. CCTP messages carry
**no** auth data — auth config is applied per-chain through the registry's
`applyAuthBundle` path only.

### 7. Emergency Recovery

The `EmergencyWithdrawModule` provides a guaranteed exit path that is completely
independent of the Brava infrastructure (AdminVault, SequenceExecutor, EIP-712
module). If the Brava admin multisig is compromised and the normal execution
path is disabled, the Safe owner can still:

- Withdraw any ERC20 token to an owner address
- Withdraw ETH to an owner address

The module is stateless, has no admin, and has no dependency on any
Brava-controlled contract. Both the caller and recipient must be Safe owners.

## Auth Registry: Single Write Path

The AuthRegistry has exactly one way to receive an auth config update:

| Path | Trigger | Trust Source | Bundle Execution |
|------|---------|-------------|-----------------|
| `applyAuthBundle` | Permissionless relay of an Owner-signed AuthBundle | EIP-712 signature by a Safe owner (or, pre-deployment, the CREATE2-derived owner) | No (auth only) |

Every application enforces:

- Version must be monotonically increasing (stale versions revert)
- Version cannot jump forward by more than `MAX_VERSION_INCREASE` (10) — bounds
  version-space exhaustion while letting a chain skip missed versions
- Same version with identical config is idempotent (no-op)
- Same version with different config is a conflict (reverts)
- Max 10 managers, max 10 co-signers per Safe
- No zero addresses, no address in both manager and co-signer sets
- Threshold cannot exceed co-signer count. A threshold of **0 with co-signers
  present is permitted**: it registers a dormant co-signer set for staged
  onboarding (the co-signer can be exercised in simulation without gating live
  execution); the threshold is raised in a later update
- Bundle expiry (`expiry`) bounds how long an unrelayed signed config stays
  submittable

## Signer Classification Priority

When the module recovers signers from a bundle, each is classified in strict
priority order:

```
1. Owner   — Safe.isOwner(signer) returns true
2. CoSigner — authRegistry.isCoSigner(safe, signer) returns true
3. Manager  — authRegistry.isManager(safe, signer) returns true
4. Reject   — signer is none of the above → revert
```

If an address appears in both the Safe's owner list and the AuthRegistry
(e.g. registered as a co-signer), it is always classified as Owner. This
silently reduces the effective co-signer count, so SDK tooling should prevent
overlap at bundle construction time.

## Version Semantics

Auth config versions are per-Safe monotonic counters:

- **Version 0** is reserved (the "uninitialized" sentinel)
- **First config** must use version >= 1
- Each subsequent update must use a version strictly greater than the current,
  at most `MAX_VERSION_INCREASE` (10) ahead
- Submitting the same version with the same config is a no-op (idempotent)
- Submitting the same version with different config reverts (conflict)

This design allows the same bundle (same version) to be safely submitted on
multiple chains without double-apply concerns, while preventing accidental
rollbacks from stale or reordered messages.
