# EIP-712 Typed Data Module

The `EIP712TypedDataSafeModule` executes user-signed bundles with chain-specific
sequences. It verifies intent, handles optional Safe deployment, and can process
token-based gas refunds.

## Core Behavior

- Domain separator uses `chainId: 1` and the target Safe as the verifying
  contract.
- Per-Safe nonces are stored on the module and incremented on success.
- A sequence is selected by `block.chainid` and the expected nonce.
- Actions are validated against `AdminVault` and the action’s `protocolName()`
  and `actionType()`.
- Sequence execution happens via the Safe (module call →
  `execTransactionFromModule` → `delegatecall` into `SequenceExecutor`).
- If `enableGasRefund=true`, the sequence must include a refund action (`ActionType.FEE_ACTION`).
  If `enableGasRefund=false`, the sequence must not include it. The module enforces this. Position is not enforced; sequences should generally place the refund action near the end for clarity.

## Data Structures

```solidity
struct ActionDefinition { string protocolName; uint8 actionType; }
struct Sequence { string name; ActionDefinition[] actions; bytes4[] actionIds; bytes[] callData; }
struct ChainSequence {
  uint256 chainId;
  uint256 sequenceNonce;
  bool deploySafe;
  bool enableGasRefund;
  address refundToken;      // required if enableGasRefund
  uint256 maxRefundAmount;  // 0 = unlimited
  uint8 refundRecipient;    // 0=executor, 1=fee recipient
  Sequence sequence;
}
struct Bundle { uint256 expiry; ChainSequence[] sequences; }
```

## Domain and Hashing

- Domain:
  `{ name, version, chainId: 1, verifyingContract: safe, salt: keccak256("BravaSafe") }`
- Always compute the bundle hash with the contract’s hashing helpers to match
  on-chain encoding.

```solidity
function getDomainSeparator(address safe) external view returns (bytes32);
function getBundleHash(address safe, Bundle calldata bundle) external view returns (bytes32);
```

## Execution

```solidity
constructor(address configSetter) // Address authorized to call initializeConfig once
function executeBundle(address safe, Bundle calldata bundle, bytes calldata signature) external payable;
```

- Rejects expired bundles.
- Recovers signer from `hashBundleForSigning(safe, bundle)` and requires signer
  is an owner of `safe`.
- Finds the sequence with `chainId == block.chainid` and
  `sequenceNonce == sequenceNonces[safe]`.
- Optionally deploys `safe` when `deploySafe == true` by validating
  `predictSafeAddress(signer)` and deploying via `SafeDeployment` if missing.
- Validates action definitions against registered actions.
- Executes the sequence through the Safe.
- Increments nonce and optionally processes gas refund.

## Gas Refunds

- Sequences implement refunds via a dedicated action placed near the end of the sequence and
  marked with `ActionType.FEE_ACTION`.
- Module validation enforces:
  - `enableGasRefund=true` → refund action required
  - `enableGasRefund=false` → refund action forbidden
- `refundToken` must be non-zero and supported by `TokenRegistry`.
- Recipient is executor (0) or module’s fee recipient (1). The executor is the EOA captured by the module as `tx.origin`.

## Minimal Example

```typescript
// Build a single-chain bundle
const bundle = {
  expiry: Math.floor(Date.now() / 1000) + 3600,
  sequences: [
    {
      chainId: 8453,
      sequenceNonce: await module.getSequenceNonce(safe),
      deploySafe: false,
      enableGasRefund: true,
      refundToken: USDC,
      maxRefundAmount: parseUnits('25', 6),
      refundRecipient: 0,
      sequence: {
        name: 'Supply',
        actions: [{ protocolName: 'AaveV3', actionType: 0 }],
        actionIds: [AAVE_SUPPLY_ID],
        callData: [supplyData],
      },
    },
  ],
};

// Get digest from contract helpers
const digest = await module.getBundleHash(safe, bundle);
const signature = await signer.signMessage(ethers.getBytes(digest));

await module.executeBundle(safe, bundle, signature);
```

## Notes

- Nonces are per-Safe on this module
  (`mapping(address => uint256) public sequenceNonces`).
- Action IDs come from `AdminVault` (bytes4 keys), and action definitions must
  match the action contract at that ID.
- All action calls execute via `delegatecall` inside `SequenceExecutor`, so
  token operations act in the Safe’s context.
