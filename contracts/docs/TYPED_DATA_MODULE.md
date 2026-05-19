# EIP-712 Typed Data Module

The `EIP712TypedDataSafeModule` executes multi-signed bundles with chain-specific
sequences. It verifies signer authority via the AuthRegistry, handles optional
Safe deployment, enforces manager restrictions, and can process USDC gas refunds.

## Core Behavior

- Domain separator uses `chainId: 1` and the target Safe as the verifying
  contract.
- Per-Safe nonces are stored on the module and incremented on success.
- A sequence is selected by `block.chainid` and the expected nonce.
- Actions are validated against `AdminVault` and the action's `protocolName()`
  and `actionType()`.
- Sequence execution happens via the Safe (module call →
  `execTransactionFromModule` → `delegatecall` into `SequenceExecutor`).
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

struct ManagerRestriction {
    address manager;
    uint8[] allowedActionTypes; // bitmap derived on-chain
}

struct AuthUpdate {
    uint256 newVersion;           // 0 = no update
    address[] newManagers;
    address[] newCoSigners;
    uint256 managerCoSignThreshold;
    ManagerRestriction[] managerRestrictions;
}

struct Bundle {
    uint256 expiry;
    ChainSequence[] sequences;
    AuthUpdate authUpdate;
}
```

## Execution Flow

```
executeBundle(safe, bundle, signatures)
  │
  ├─ 1. Reject expired bundles
  ├─ 2. Compute EIP-712 digest
  ├─ 3. Recover signers from packed signatures (65 bytes each, sorted ascending)
  ├─ 4. Deploy Safe if target sequence has deploySafe=true and Safe doesn't exist
  ├─ 5. Classify each signer: Owner > CoSigner > Manager > Reject
  ├─ 6. Verify thresholds (owner or manager required; manager needs co-signatures)
  ├─ 7. Apply auth update if present (owner-only, runs before sequence execution)
  ├─ 8. Find chain sequence matching block.chainid and expected nonce
  ├─ 9. Enforce manager restrictions (if manager-signed, no owner)
  ├─ 10. Validate action definitions against AdminVault
  ├─ 11. Execute sequence through Safe via delegatecall
  ├─ 12. Process gas refund if enabled
  └─ 13. Log sequence completion
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

### Auth Updates

An `AuthUpdate` with `newVersion != 0` triggers a full auth config replacement
on the AuthRegistry. Only owner-signed bundles (no manager) may carry updates.
The update applies before sequence execution so that CCTP propagation actions in
the sequence emit the post-update snapshot.

Auth updates apply on **every chain** the bundle is submitted to, not just the
chain with a matching sequence. This is by design — auth state is global per
Safe and cross-chain propagation relies on this.

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

## Gas Refunds

- Sequences implement refunds via a dedicated action placed in the sequence and
  marked with `ActionType.FEE_ACTION`.
- Module validation enforces:
  - `enableGasRefund=true` → refund action required
  - `enableGasRefund=false` → refund action forbidden
- USDC is used for refund payments via a gas price adaptor oracle.
- Recipient is tx.origin (0) or the module's fee recipient (1).
- `maxRefundAmount` caps the refund (0 = no cap).
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
