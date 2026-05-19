# Auth System Overview

High-level operational overview of the Brava auth system — who the actors are,
what they can do, and how the contracts enforce it.

## Actors

### Safe Owner (Custodian)

The Safe owner is typically an institutional custodian or the end user who
deployed the Safe. They hold the Safe's signing key and have ultimate authority:

- Full control over auth configuration (managers, co-signers, thresholds)
- Can execute any sequence of actions without co-signing requirements
- Can update auth config on the current chain and propagate it cross-chain
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
- **Cannot** modify auth config — only the owner can add/remove managers
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

The owner signs a bundle carrying an `AuthUpdate` to register:

- **Managers** — addresses that will execute day-to-day operations
- **Co-signers** — addresses required to co-approve manager bundles
- **Co-sign threshold** — how many co-signers a manager bundle needs
- **Manager restrictions** (optional) — per-manager action type limits

This auth config is stored in the `AuthRegistry`, not in the module itself.
The registry is a separate contract so that auth state survives module upgrades.

The owner can propagate the same auth config to other chains in two ways:

1. **Same bundle, multiple chains** — the bundle contains chain sequences for
   each target chain. When submitted on each chain, the auth update applies
   before any sequence executes.
2. **CCTP propagation** — a `CCTPBridgeSend` action with `propagateAuth=true`
   encodes the current auth snapshot into the CCTP hook data. The destination
   chain's `AuthRegistry` receives the Circle-attested message and applies the
   snapshot, optionally executing a bundle in the same transaction.

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

### 4. Auth Updates

Only the **owner** can update auth config. The update is carried inside the
bundle's `authUpdate` field with a monotonically increasing version number.
Auth updates apply **before** sequence execution so that:

- A `CCTPBridgeSend(propagateAuth=true)` in the sequence emits the post-update
  snapshot
- The update applies on every chain the bundle is submitted to, not just the
  chain with a sequence

A manager **cannot** carry an auth update — the module reverts if a manager
signature is present and `authUpdate.newVersion != 0`.

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
cross-chain transfer protocol. The `relayCCTPAndExecute` path on AuthRegistry
combines three operations into a single attested message:

1. Mint USDC on the destination chain
2. Apply an auth config snapshot (if present in hook data)
3. Execute a bundle through the destination Safe's module

### 7. Emergency Recovery

The `EmergencyWithdrawModule` provides a guaranteed exit path that is completely
independent of the Brava infrastructure (AdminVault, SequenceExecutor, EIP-712
module). If the Brava admin multisig is compromised and the normal execution
path is disabled, the Safe owner can still:

- Withdraw any ERC20 token to an owner address
- Withdraw ETH to an owner address

The module is stateless, has no admin, and has no dependency on any
Brava-controlled contract. Both the caller and recipient must be Safe owners.

## Auth Registry: Three Write Paths

The AuthRegistry has three ways to receive an auth config update, all sharing
the same validation and application logic:

| Path | Trigger | Trust Source | Bundle Execution |
|------|---------|-------------|-----------------|
| `setAuthConfig` | Module call after owner bundle verification | Module must be enabled on the Safe | N/A (already in module flow) |
| `receiveCCTPAuthUpdate` | Permissionless relay of Circle attestation | CCTP message with burn/mint/hook triple-check | No |
| `relayCCTPAndExecute` | Permissionless relay of Circle attestation | Same as above, plus best-effort bundle forward | Yes (best-effort) |

All three paths enforce:

- Version must be monotonically increasing (stale versions revert)
- Same version with identical config is idempotent (no-op)
- Same version with different config is a conflict (reverts)
- Max 10 managers, max 10 co-signers per Safe
- No zero addresses, no address in both manager and co-signer sets
- Threshold cannot exceed co-signer count

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
- Each subsequent update must use a version strictly greater than the current
- Submitting the same version with the same config is a no-op (idempotent)
- Submitting the same version with different config reverts (conflict)

This design allows the same bundle (same version) to be safely submitted on
multiple chains without double-apply concerns, while preventing accidental
rollbacks from stale or reordered messages.
