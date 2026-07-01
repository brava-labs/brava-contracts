# EIP-712 Typed Data Module

The `EIP712TypedDataSafeModule` executes multi-signed bundles with chain-specific
sequences. It verifies signer authority against the Safe's owner list and the
`AuthRegistry`, handles optional Safe deployment, enforces manager restrictions,
and can process USDC gas refunds.

Auth configuration (managers, co-signers, thresholds) is **not** carried in
execution bundles. It is written exclusively through the `AuthRegistry`'s own
Owner-signed `AuthBundle` path (`applyAuthBundle`) — see
`AUTH_SYSTEM_OVERVIEW.md`. The module only reads from the registry.

## Core Behavior

- Domain separator uses `chainId: 1` and the target Safe as the verifying
  contract, so one signature is valid on every chain.
- Per-Safe nonces are stored on the module and incremented on success.
- A sequence is selected by `block.chainid` and the expected nonce.
- Actions are validated against `AdminVault` and the action's `protocolName()`
  and `actionType()`.
- Sequence execution happens via the Safe (module call →
  `execTransactionFromModule` → `delegatecall` into `SequenceExecutor`).
- `executeBundle` is `nonReentrant`: re-entering bundle execution within the
  same transaction reverts. Legitimate cross-Safe concurrency happens in
  separate transactions and is unaffected.
- If `enableGasRefund=true`, the sequence must include a refund action
  (`ActionType.FEE_ACTION`). If `enableGasRefund=false`, it must not. The
  module enforces both directions.

## Data Structures

```solidity
struct ActionDefinition { string protocolName; uint8 actionType; }

struct Sequence {
    string name;
    ActionDefinition[] actions;
    bytes4[] actionIds;
    bytes[] callData;
}

struct ChainSequence {
    uint256 chainId;
    uint256 sequenceNonce;
    bool deploySafe;
    bool enableGasRefund;
    uint256 maxRefundAmount;   // 0 = unlimited
    uint8 refundRecipient;     // 0 = tx.origin, 1 = fee recipient
    Sequence sequence;
}

struct Bundle {
    uint256 expiry;
    ChainSequence[] sequences;
}
```

## Execution Flow

```
executeBundle(safe, bundle, signatures)   [nonReentrant]
  │
  ├─ 1. Reject expired bundles
  ├─ 2. Compute EIP-712 digest
  ├─ 3. Recover signers from packed signatures (65 bytes each, sorted ascending)
  ├─ 4. Deploy Safe if target sequence has deploySafe=true and Safe doesn't exist
  ├─ 5. Classify each signer: Owner > CoSigner > Manager > Reject
  ├─ 6. Verify thresholds (owner or manager required; manager needs co-signatures)
  ├─ 7. Find chain sequence matching block.chainid and expected nonce
  ├─ 8. Enforce manager restrictions (if manager-signed, no owner)
  ├─ 9. Log BUNDLE_AUTHORISED (bundle hash, authorising principal, co-signers)
  ├─ 10. Validate action definitions against AdminVault
  ├─ 11. Execute sequence through Safe via delegatecall
  ├─ 12. Process gas refund if enabled
  └─ 13. Log SEQUENCE_COMPLETE (consumed nonce + chain-independent bundle hash)
```

### Signature Format

Signatures are packed 65-byte ECDSA signatures (`r[32] || s[32] || v[1]`)
concatenated together, sorted by recovered signer address in ascending order.
The module enforces strict ascending order — duplicate or unsorted signatures
revert. Maximum 32 signatures per bundle.

### Signer Classification

Each recovered signer is classified against the Safe's owner list and the
AuthRegistry:

1. **Owner** — `Safe.isOwner(signer)` is true
2. **Co-signer** — `authRegistry.isCoSigner(safe, signer)` is true
3. **Manager** — `authRegistry.isManager(safe, signer)` is true
4. **Unknown** — none of the above → revert

At most one manager is allowed per bundle. Owner classification takes priority,
so an address that is both a Safe owner and a registered manager/co-signer will
always count as an Owner.

### Manager Restrictions

When a bundle is signed by a manager (and no owner), the module checks each
action in the sequence against the manager's allowed action types stored in the
AuthRegistry. A zero bitmap (no restrictions entry) means the manager can
execute any action type. A non-zero bitmap restricts the manager to only the
set bits.

## Domain and Hashing

- Domain:
  `{ name, version, chainId: 1, verifyingContract: safe, salt: keccak256("BravaSafe") }`
- Always use the contract's hashing helpers to match on-chain encoding.

```solidity
function getDomainSeparator(address safe) external view returns (bytes32);
function getBundleHash(address safe, Bundle calldata bundle) external view returns (bytes32);
function getRawBundleHash(Bundle calldata bundle) external pure returns (bytes32);
```

## Execution Audit Trail

Two Logger events tie every executed leg back to the signed bundle and its
signers:

- **`BUNDLE_AUTHORISED`** — emitted once per executed leg, carrying the
  chain-independent bundle struct hash, the authorising principal (owner or
  manager), and the co-signer addresses. Owner-vs-manager is resolved off-chain
  from Safe/registry state.
- **`SEQUENCE_COMPLETE`** — emitted after the sequence executes, carrying the
  consumed nonce and the same bundle hash, so off-chain indexers can link all
  legs of one signed bundle across chains (including both sides of a bridge
  pair).

## Gas Refunds

- Sequences implement refunds via a dedicated action placed in the sequence and
  marked with `ActionType.FEE_ACTION`.
- Module validation enforces:
  - `enableGasRefund=true` → refund action required
  - `enableGasRefund=false` → refund action forbidden
- USDC is used for refund payments via a gas price adaptor oracle.
- Recipient is tx.origin (0) or the module's fee recipient (1); any other
  value reverts when a fee action is present.
- `maxRefundAmount` caps the refund (0 = no cap).
- Bundles entered through the trusted `cctpBundleReceiver` get a configurable
  `cctpRelayOverhead` gas allowance added, covering relay work (CCTP message
  validation, Circle's mint, module discovery) spent before the module's gas
  snapshot. Set via `setCctpRelayRefundConfig` (AdminVault owner-gated); the
  payout is still capped by `maxRefundAmount`.
- Any USDC remainder on the module is returned to the Safe after refund.

## Gas Estimation

```solidity
function estimateBundleGas(address safe, Bundle calldata bundle) external;
```

Simulates bundle execution without signatures, using `msg.sender` as the
presumed owner. All state mutations are rolled back via
`revert SimulationComplete(gasUsed)`. Callers catch the revert and decode the
gas estimate.

## Notes

- Nonces are per-Safe on this module
  (`mapping(address => uint256) public sequenceNonces`).
- Action IDs come from `AdminVault` (bytes4 keys), and action definitions must
  match the action contract at that ID.
- All action calls execute via `delegatecall` inside `SequenceExecutor`, so
  token operations act in the Safe's context.
- The module rejects direct ETH transfers.
