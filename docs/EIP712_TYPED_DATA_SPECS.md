# EIP-712 Typed Data Safe Module Specifications

## Overview

The EIP-712 Typed Data Safe Module is a Safe module that handles cross-chain bundle execution through EIP-712 typed data signing. It allows Safe owners to sign structured data representing execution bundles that contain sequences for multiple chains, enabling secure and verifiable cross-chain operations.

## Core Requirements

The module should:

1. **Verify EIP-712 Signatures**: Verify the provided EIP-712 signature against the Safe owner (or one of the owners) to ensure the bundle is legitimate.

2. **Parse Multi-Chain Bundles**: Parse the bundle, which contains an array of sequences intended for various chains and nonces, ensuring that the correct sequence for the current chain and the next nonce is identified and processed.

3. **Extract Chain-Specific Actions**: Extract the sub-array of actions that corresponds to the current chain and nonce.

4. **Validate Action Data**: Iterate through each action in the sub-array, verifying that the typed data matches the provided call data to ensure its validity.

5. **Forward to Executor**: Once validated, forward the verified sub-array to the sequence executor for further processing, allowing the rest of the system to continue as usual.

## EIP-712 Data Structure

### Bundle
The top-level structure that contains all sequences across chains:
```solidity
struct Bundle {
    uint256 expiry;          // Expiry timestamp for the entire bundle
    ChainSequence[] sequences; // Array of sequences for different chains
}
```

### ChainSequence
Represents a sequence intended for a specific chain:
```solidity
struct ChainSequence {
    uint256 chainId;         // Target chain ID
    uint256 sequenceNonce;   // Sequence nonce for this chain
    Sequence sequence;       // The actual sequence to execute
}
```

### Sequence
The execution sequence containing actions and their data:
```solidity
struct Sequence {
    string name;                    // Human-readable sequence name
    ActionDefinition[] actions;     // Action type definitions
    bytes4[] actionIds;            // Action identifiers
    bytes[] callData;              // Call data for each action
}
```

### ActionDefinition
Defines the expected action type for validation:
```solidity
struct ActionDefinition {
    string protocolName;    // Protocol name (e.g., "aave-v3")
    uint8 actionType;       // Action type (e.g., 0 = supply, 1 = withdraw)
}
```

## EIP-712 Type Hashes

The following type hashes are used for EIP-712 encoding:

```solidity
bytes32 private constant BUNDLE_TYPEHASH = keccak256(
    "Bundle(uint256 expiry,ChainSequence[] sequences)ChainSequence(uint256 chainId,uint256 sequenceNonce,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)"
);

bytes32 private constant CHAIN_SEQUENCE_TYPEHASH = keccak256(
    "ChainSequence(uint256 chainId,uint256 sequenceNonce,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)"
);

bytes32 private constant SEQUENCE_TYPEHASH = keccak256(
    "Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)"
);

bytes32 private constant ACTION_DEFINITION_TYPEHASH = keccak256(
    "ActionDefinition(string protocolName,uint8 actionType)"
);
```

## Action ID Generation

Action IDs are generated using the following process:
```solidity
function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
    return bytes4(keccak256(abi.encodePacked(_addr)));
}
```

This creates a 4-byte identifier by:
1. Hashing the contract address using `keccak256(abi.encodePacked(address))`
2. Taking the first 4 bytes of the hash and casting to `bytes4`
3. Using this ID to uniquely identify action contracts in the AdminVault

The ActionID links to a specific version of an action contract. When contracts are upgraded, they receive new IDs, ensuring users only sign for specific contract versions.

## EIP-712 Domain Separator

For user convenience, the domain separator always uses chainId 1:

```solidity
EIP712Domain {
    name: "BravaSafeModule", 
    version: "1",
    chainId: 1,  // Always use chainId 1 for user convenience
    verifyingContract: address(this)
}
```

**Critical Design Decision:**
- **Always use `chainId: 1`** regardless of deployment chain for user convenience
- Users sign bundles with the same domain separator across all chains
- This intentionally breaks standard EIP-712 cross-chain replay protection
- **Security is restored through ChainSequence validation:**
  - Each ChainSequence contains an explicit `chainId` field
  - Contract validates the sequence is intended for `block.chainid`
  - Chain-specific sequence nonces prevent replay attacks
  - Failed execution on one chain doesn't affect others

**Why This Design:**
- **User Experience**: No need to switch domain context when signing for different chains
- **Wallet Compatibility**: Many wallets work better with consistent domain separators
- **Security**: ChainSequence-level validation provides equivalent protection

## Verification Process

### 1. Expiry Verification
- Verify that the bundle expiry timestamp is greater than `block.timestamp`
- Expired bundles should be rejected with `EIP712TypedDataSafeModule_BundleExpired()` error

### 2. Signature Verification
- Recover the signer address from the EIP-712 signature
- Verify that the signer is an owner of the Safe using `IOwnerManager.isOwner()`

### 3. Chain Sequence Selection
- Identify the sequence for the current chain (`block.chainid`)
- Ensure the sequence nonce matches the expected nonce for this chain
- Chain nonces are independent - failure on one chain doesn't block others

### 4. Action Validation
- For each action in the sequence:
  - Verify the action exists in the AdminVault using `getActionAddress()`
  - Check that the protocol name matches the action's `protocolName()`
  - Verify the action type matches the action's `actionType()`
  - Ensure arrays (actions, actionIds, callData) have matching lengths

## Execution Flow

1. **Input Validation**: Validate bundle structure and expiry
2. **Signature Recovery**: Recover signer from EIP-712 signature
3. **Owner Verification**: Confirm signer is a Safe owner
4. **Sequence Selection**: Find the appropriate sequence for current chain/nonce
5. **Action Validation**: Validate all actions in the sequence
6. **Nonce Update**: Increment the processed nonce for the Safe on this chain
7. **Execution**: Execute the sequence via Safe's `execTransactionFromModule()`

## Nonce Management

### Sequence Nonces
- Each chain maintains independent sequence nonces per Safe
- Nonces must be sequential (no gaps, no replays)
- Failed sequences can be retried with the same nonce
- New bundles can include sequences for different chains with different nonce states

### Bundle Nonce
Bundle-level nonces have been removed as they:
- Added complexity without clear benefits
- Could block execution when bundles had non-overlapping chains
- Are unnecessary when individual sequence nonces provide protection

### Storage Requirements
The module stores sequence nonces per chain per Safe. Since modules execute via delegate call:
- Storage patterns must avoid collision with Safe's existing storage
- Module upgrades should consider nonce state preservation
- Investigation needed into Safe's storage management for modules

## Security Considerations

- **Nonce Management**: Chain-specific nonces prevent replay attacks and ensure ordered execution
- **Owner Verification**: Only Safe owners can authorize bundle execution
- **Action Validation**: Actions must match their typed data definitions
- **Chain Isolation**: Each chain maintains separate sequence nonces
- **Module Permissions**: Uses Safe's module transaction system for execution
- **Expiry Protection**: Time-based expiry prevents stale transaction execution
- **Owner Stability**: Owner changes may invalidate pending transactions (by design)

## Error Handling

The module defines specific error types for different failure scenarios:
- `EIP712TypedDataSafeModule_InvalidSignature()`: Invalid EIP-712 signature
- `EIP712TypedDataSafeModule_BundleExpired()`: Bundle past expiry timestamp
- `EIP712TypedDataSafeModule_ChainSequenceNotFound()`: No sequence for current chain/nonce
- `EIP712TypedDataSafeModule_ActionMismatch()`: Action validation failed
- `EIP712TypedDataSafeModule_ExecutionFailed()`: Sequence execution failed
- `EIP712TypedDataSafeModule_SignerNotOwner()`: Signer is not a Safe owner
- `EIP712TypedDataSafeModule_LengthMismatch()`: Array length mismatch

## Integration Requirements

- **AdminVault**: Required for action address resolution via `getActionAddress()`
- **SequenceExecutor**: Target contract for sequence execution
- **Safe Contracts**: Must support module transactions and owner management
- **Action Contracts**: Must implement `ActionBase` with `protocolName()` and `actionType()`

## Implementation Notes

### Custom EIP-712 Implementation

The module implements its own EIP-712 domain separator logic rather than using OpenZeppelin's EIP712 contract, allowing for the custom chainId 1 behavior.

**Standalone Module Architecture:**
Since Safe modules are standalone contracts (not executed via delegate call), the domain name and version are stored as regular string fields in contract storage. This is simpler than the previous ShortStrings implementation which was unnecessary complexity.

### Signature Verification

The module uses a custom EIP-712 implementation that differs slightly from standard TypeScript EIP-712 encoders in how it handles `bytes4[]` arrays. Specifically:

- The contract encodes `bytes4` values using `keccak256(abi.encode(bytes4))` 
- Standard TypeScript EIP-712 encoders handle `bytes4[]` differently
- This difference is intentional and provides better compatibility with Solidity's type system

### Testing Considerations

When testing the module:
1. Use the contract's `getBundleHash()` method to get the correct EIP-712 digest for signing
2. Sign the digest directly using raw ECDSA signatures (without Ethereum message prefixes)
3. The contract's hash will not match TypeScript EIP-712 encoder hashes due to `bytes4[]` encoding differences
4. **Safe Error Handling**: When modules execute via `execTransactionFromModule`, Safe may override custom errors with Safe-specific ones (e.g., GS013). Test for general reverts rather than specific module errors in some cases.

### Hash Generation Process

The contract follows this hash generation process:
1. Hash each `ActionDefinition` using its type hash and encoded fields
2. Hash each `Sequence` by encoding its fields and array hashes
3. Hash each `ChainSequence` by encoding the chain ID, nonce, and sequence hash
4. Hash the `Bundle` by encoding the expiry and array of chain sequence hashes
5. Apply the EIP-712 domain separator to create the final digest

## Future Enhancements

This specification may be extended to include:
- Multi-signature support for enhanced security
- Batch processing of multiple bundles
- Cross-chain state synchronization
- Enhanced gas optimization strategies
- Support for conditional execution logic 

## Safe Deployment Integration

### Overview

The EIP-712 Typed Data Safe Module is integrated with the SafeDeployment system to provide seamless Safe deployment and execution. This integration allows users to sign bundles that automatically deploy Safes when needed, maintaining the single-signature multi-chain execution model.

### Architecture

The integrated system consists of:

1. **SafeDeployment Contract**: Orchestrates Safe deployment and forwards typed data bundles
2. **EIP712TypedDataSafeModule**: Handles signature verification and sequence execution
3. **SafeSetupRegistry**: Manages Safe configuration templates

### Execution Flow

```
1. User signs Bundle once using EIP712TypedDataSafeModule domain
2. On any chain, someone calls SafeDeployment.executeTypedDataBundle(bundle, signature)
3. SafeDeployment recovers signer address from bundle signature
4. SafeDeployment checks if Safe exists for that signer
5. If not, deploys Safe with EIP712TypedDataSafeModule enabled
6. SafeDeployment forwards bundle + signature to EIP712TypedDataSafeModule.executeBundle()
7. Module performs full verification and execution
```

### Key Benefits

- **Single Signature Multi-Chain**: One signature works across all chains
- **Automatic Safe Deployment**: Safes are deployed only when needed
- **Minimal SafeDeployment Logic**: All security verification stays in the battle-tested module
- **Consistent Addresses**: Safe addresses are deterministic across chains
- **No Deployment-Specific Data**: Bundle structure remains unchanged

### SafeDeployment Functions

#### executeTypedDataBundle
```solidity
function executeTypedDataBundle(
    Bundle calldata _bundle,
    bytes calldata _signature
) external payable
```

The main entry point that:
1. Verifies module is configured
2. Recovers signer from bundle signature
3. Ensures Safe exists (deploys if needed)
4. Forwards to module for verification and execution

#### setEIP712TypedDataModule
```solidity
function setEIP712TypedDataModule(address _moduleAddress) external onlyRole(OWNER_ROLE)
```

Administrative function to set the module address.

### Configuration Requirements

The SafeDeployment system requires:

1. **Typed Data Configuration**: A SafeSetupRegistry configuration with ID `keccak256("TYPED_DATA_SAFE_CONFIG")`
2. **Module Inclusion**: The configuration must include the EIP712TypedDataSafeModule
3. **Module Address**: SafeDeployment must be configured with the module address

### Error Handling

Additional errors for the integration:
- `SafeDeployment_TypedDataModuleNotSet()`: Module address not configured
- `SafeDeployment_TypedDataConfigNotApproved()`: Required configuration not approved
- `SafeDeployment_InvalidTypedDataSignature()`: Signature recovery failed

### Usage Example

```typescript
// 1. Deploy and configure SafeDeployment
await safeDeployment.setEIP712TypedDataModule(moduleAddress);

// 2. Set up configuration in SafeSetupRegistry
await setupRegistry.proposeSetupConfig(
    ethers.id("TYPED_DATA_SAFE_CONFIG"),
    fallbackHandler,
    [eip712ModuleAddress],
    guardAddress
);
await setupRegistry.approveSetupConfig(ethers.id("TYPED_DATA_SAFE_CONFIG"));

// 3. User signs bundle
const bundle = { expiry, sequences: [...] };
const bundleHash = await module.getBundleHash(bundle);
const signature = await signer.signMessage(ethers.getBytes(bundleHash));

// 4. Execute on any chain (deploys Safe if needed)
await safeDeployment.executeTypedDataBundle(bundle, signature);
```

### Security Considerations

- **Signature Authority**: SafeDeployment only recovers signatures; all verification is done by the module
- **Configuration Security**: Typed data configurations follow the same proposal/approval process
- **Module Security**: Uses the same battle-tested EIP712TypedDataSafeModule for all verification
- **Role-Based Access**: Module configuration requires OWNER_ROLE

### Multi-Chain Deployment Scenario

Consider a user with a Safe on Mainnet who wants to execute on Base:

1. **User signs bundle** with sequences for both Mainnet and Base
2. **On Mainnet**: SafeDeployment finds existing Safe, forwards to module, executes
3. **On Base**: SafeDeployment deploys new Safe with same deterministic address, enables module, forwards to module, executes
4. **Result**: Same signature executes on both chains, Safe exists on both chains with same address

This seamless experience eliminates the need for users to manage Safe deployment separately from execution. 