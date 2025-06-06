# EIP712TypedDataSafeModule

## Overview

The `EIP712TypedDataSafeModule` is a Safe module that enables secure cross-chain bundle execution using EIP-712 typed data signing. It allows Safe owners to sign structured bundles containing sequences for multiple chains and nonces, ensuring that only the appropriate sequence for the current chain is executed.

**Key Design Decision**: The module uses **chainID 1** for all EIP-712 domain separators to ensure cross-chain compatibility and easier signature validation. Chain-specific protection is maintained at the sequence level, where each sequence includes its target `chainId` and `sequenceNonce`.

## Features

- ✅ **EIP-712 Typed Data Signing**: Uses standardized structured data signing for security
- ✅ **Cross-Chain Compatibility**: Uses chainID 1 for consistent domain across all networks  
- ✅ **Cross-Chain Support**: Handles bundles containing sequences for multiple chains
- ✅ **Nonce Management**: Tracks processed nonces to prevent replay attacks
- ✅ **Safe Owner Verification**: Ensures only Safe owners can execute bundles
- ✅ **Sequence Validation**: Validates action IDs and call data before execution
- ✅ **Integration with Sequence Executor**: Seamlessly forwards validated sequences

## Architecture

### Data Structures

#### Bundle
```solidity
struct Bundle {
    uint256 nonce;
    ChainSequence[] sequences;
}
```

#### ChainSequence
```solidity
struct ChainSequence {
    uint256 chainId;
    uint256 sequenceNonce;
    Sequence sequence;
}
```

#### ActionDefinition
```solidity
struct ActionDefinition {
    string protocolName;
    uint8 actionType;
}
```

#### Sequence
```solidity
struct Sequence {
    string name;
    ActionDefinition[] actions;
    bytes4[] actionIds;
    bytes[] callData;
}
```

### EIP-712 Type Definitions

The module uses the following EIP-712 type hashes:

- **BUNDLE_TYPEHASH**: `Bundle(uint256 nonce,ChainSequence[] sequences)ChainSequence(uint256 chainId,uint256 sequenceNonce,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)`
- **CHAIN_SEQUENCE_TYPEHASH**: `ChainSequence(uint256 chainId,uint256 sequenceNonce,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)`
- **SEQUENCE_TYPEHASH**: `Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)`
- **ACTION_DEFINITION_TYPEHASH**: `ActionDefinition(string protocolName,uint8 actionType)`

## Usage

### 1. Deployment

Deploy the module with the required parameters:

```solidity
EIP712TypedDataSafeModule module = new EIP712TypedDataSafeModule(
    adminVaultAddress,     // Address of the AdminVault
    sequenceExecutorAddress, // Address of the SequenceExecutor
    "BravaEIP712Module",   // Domain name
    "1.0.0"               // Domain version
);
```

### 2. Enable Module in Safe

The module must be enabled in the Safe before it can be used:

```solidity
// This should be called via Safe transaction
safe.enableModule(moduleAddress);
```

### 3. Create and Sign Bundles

#### Step 3.1: Create Bundle Structure

```typescript
const bundle = {
  nonce: 0, // Current processed nonce for the Safe
  sequences: [
    {
      chainId: 1, // Ethereum mainnet
      sequenceNonce: 42,
      sequence: {
        name: "Cross-chain DeFi Operation",
        actions: [
          {
            protocolName: "AaveV3",
            actionType: 0 // DEPOSIT_ACTION
          },
          {
            protocolName: "YearnV3", 
            actionType: 1 // WITHDRAW_ACTION
          }
        ],
        actionIds: [
          "0x12345678", // Aave V3 Supply Action ID
          "0x87654321"  // Yearn V3 Withdraw Action ID
        ],
        callData: [
          "0x1234...", // Encoded action call data for Aave supply
          "0x5678..."  // Encoded action call data for Yearn withdraw
        ]
      }
    },
    {
      chainId: 137, // Polygon
      sequenceNonce: 24,
      sequence: {
        name: "Polygon Operation",
        actions: [
          {
            protocolName: "Curve",
            actionType: 0 // DEPOSIT_ACTION
          }
        ],
        actionIds: ["0xfedcba98"],
        callData: ["0xabcd..."]
      }
    }
  ]
};
```

#### Step 3.2: Generate EIP-712 Hash

```typescript
// Get the EIP-712 hash from the module
const bundleHash = await module.getBundleHash(bundle);
```

#### Step 3.3: Sign the Bundle

```typescript
// Safe owner signs the bundle hash using chainID 1 for cross-chain compatibility
// Note: Always use chainID 1 regardless of the network you're deploying to
const signature = await signBundle(safeOwner, bundle, safeAddress, 1);
```

### 4. Execute Bundle

```solidity
// Execute the bundle on the target chain
module.executeBundle(safeAddress, bundle, signature);
```

## Execution Flow

1. **Nonce Validation**: Verifies the bundle nonce matches the expected nonce for the Safe
2. **Signature Verification**: Recovers the signer from the EIP-712 signature and verifies they are a Safe owner
3. **Chain Sequence Finding**: Locates the sequence for the current chain ID and expected sequence nonce
4. **Action Validation**: 
   - Validates array lengths match (actions, actionIds, callData)
   - For each action, retrieves the action contract using `AdminVault.getActionAddress(actionId)`
   - Calls `ActionBase.protocolName()` and `ActionBase.actionType()` on the action contract
   - Compares against the expected protocol name and action type from the typed data
   - Ensures all actions exist and match their expected definitions
5. **Sequence Execution**: Forwards the validated sequence to the SequenceExecutor via Safe module transaction
6. **Nonce Update**: Increments the processed nonce for the Safe

### Multi-Action Sequence

```typescript
// Example: Complex multi-step operation
const bundle = {
  nonce: 10,
  sequences: [
    {
      chainId: 1,
      sequenceNonce: 300,
      sequence: {
        name: "Multi-Step DeFi Operation",
        actions: [
          { protocolName: "Paraswap", actionType: 2 }, // SWAP_ACTION
          { protocolName: "AaveV3", actionType: 0 },   // DEPOSIT_ACTION
          { protocolName: "AaveV3", actionType: 1 },   // WITHDRAW_ACTION
          { protocolName: "YearnV3", actionType: 0 }   // DEPOSIT_ACTION
        ],
        actionIds: [
          PARASWAP_SWAP_ACTION_ID,
          AAVE_V3_SUPPLY_ACTION_ID,
          AAVE_V3_BORROW_ACTION_ID,
          YEARN_V3_SUPPLY_ACTION_ID
        ],
        callData: [
          swapTokensCallData,
          supplyToAaveCallData,
          borrowFromAaveCallData,
          supplyToYearnCallData
        ]
      }
    }
  ]
};
```

## ChainID 1 Design Pattern

### Why ChainID 1 for Domain?

The module uses **chainID 1** for all EIP-712 domain separators, regardless of the actual network being used. This design decision provides several benefits:

1. **Cross-Chain Consistency**: Signatures work the same way across all networks
2. **Simplified Integration**: Client applications don't need to track different chainIDs for signing
3. **Easier Validation**: Off-chain signature validation is consistent across chains
4. **Future-Proof**: New chains can be supported without signature format changes

### Security Considerations

Chain-specific protection is maintained through:
- **Sequence ChainID**: Each sequence specifies its target `chainId`
- **Sequence Nonces**: Per-chain nonce tracking prevents replay attacks  
- **Execution Validation**: Only sequences matching `block.chainid` are executed

### Example Usage

```typescript
// Always sign with chainID 1, regardless of target network
const signature = await signBundle(signer, bundle, safeAddress, 1);

// Bundle can contain sequences for multiple chains
const bundle = {
  expiry: expiry,
  sequences: [
    { chainId: 1, sequenceNonce: 10, sequence: ethereumSequence },     // Ethereum
    { chainId: 137, sequenceNonce: 5, sequence: polygonSequence },     // Polygon  
    { chainId: 42161, sequenceNonce: 3, sequence: arbitrumSequence }   // Arbitrum
  ]
};
```

## Best Practices

1. **Always Use ChainID 1**: Sign all bundles with chainID 1, never the actual network chainID
2. **Always Validate Bundles**: Verify bundle structure before signing
3. **Use Sequential Nonces**: Ensure nonces are used in order
4. **Verify Chain Context**: Check that sequences are intended for the target chain
5. **Match Action Definitions**: Ensure action definitions in typed data match actual action contracts
6. **Monitor Events**: Listen for module events to track execution
7. **Handle Errors Gracefully**: Implement proper error handling for failed executions
8. **Test Thoroughly**: Always test bundle execution on testnets first

## Deployment Checklist

- [ ] Deploy AdminVault and SequenceExecutor
- [ ] Deploy EIP712TypedDataSafeModule with correct parameters
- [ ] Enable module in target Safe(s)
- [ ] Verify module integration with existing infrastructure
- [ ] Test bundle creation and execution flows
- [ ] Verify action validation works correctly
- [ ] Monitor gas costs and optimize if necessary

## Gas Considerations

- Bundle execution gas cost scales with the number of actions in the sequence
- EIP-712 signature verification has minimal gas overhead
- Action validation requires external calls to action contracts
- Cross-chain bundle storage is off-chain, only current chain sequence is executed
- Consider batching similar operations to reduce overall gas costs

## Troubleshooting

### Common Issues

1. **Invalid Nonce Error**: Ensure nonce matches `getProcessedNonce(safeAddress)`
2. **Chain Sequence Not Found**: Verify bundle contains sequence for current chain ID
3. **Signer Not Owner**: Ensure signer address is a current Safe owner
4. **Action Mismatch**: Verify action definitions in typed data match actual action contracts
5. **Length Mismatch**: Ensure actions, actionIds, and callData arrays have the same length
6. **Execution Failed**: Check that all actions exist in AdminVault and call data is valid

### Debug Steps

1. Call `getBundleHash()` to verify bundle structure
2. Check `getProcessedNonce()` for correct nonce
3. Verify Safe ownership with `safe.isOwner(signerAddress)`
4. Validate action IDs exist in AdminVault with `AdminVault.getActionAddress(actionId)`
5. Check action contract methods: `protocolName()` and `actionType()`
6. Verify array lengths in sequence structure
7. Test sequence execution separately if needed

## Security Features

### Nonce Management
- Each Safe has its own nonce counter to prevent replay attacks
- Bundles must be executed in sequential nonce order
- Processed nonces are permanently stored and cannot be reused

### Signature Verification
- Uses EIP-712 structured data signing for security
- Verifies signer is a current owner of the Safe
- Prevents signature malleability attacks

### Chain-Specific Execution
- Only executes sequences intended for the current chain
- Uses block.chainid for chain identification
- Prevents cross-chain replay attacks

### Action Validation
- Verifies all actions exist in the AdminVault before execution
- Ensures action IDs match expected values
- Validates call data structure integrity

## Events

The module emits the following events:

### SignatureVerified
```solidity
event SignatureVerified(
    address indexed safe,
    address indexed signer,
    bytes32 indexed bundleHash
);
```

### BundleExecuted
```solidity
event BundleExecuted(
    address indexed safe,
    uint256 indexed nonce,
    uint256 indexed chainId,
    uint256 sequenceNonce
);
```

## Error Handling

The module defines custom errors for clear error reporting:

- `EIP712TypedDataSafeModule_InvalidSignature()`: Invalid or malformed signature
- `EIP712TypedDataSafeModule_InvalidNonce(uint256 expected, uint256 provided)`: Incorrect nonce
- `EIP712TypedDataSafeModule_ChainSequenceNotFound(uint256 chainId, uint256 expectedNonce)`: No sequence for current chain/nonce
- `EIP712TypedDataSafeModule_CallDataMismatch(uint256 actionIndex)`: Call data validation failure
- `EIP712TypedDataSafeModule_ExecutionFailed()`: Sequence execution failed
- `EIP712TypedDataSafeModule_SignerNotOwner(address signer)`: Signer is not a Safe owner

## Integration Examples

### Cross-Chain DeFi Strategy

```typescript
// Example: Execute a cross-chain yield farming strategy
const bundle = {
  nonce: 5,
  sequences: [
    {
      chainId: 1, // Ethereum - Withdraw from Aave
      sequenceNonce: 100,
      sequence: {
        name: "Ethereum Withdrawal",
        callData: [withdrawFromAaveCallData],
        actionIds: [AAVE_V3_WITHDRAW_ACTION_ID]
      }
    },
    {
      chainId: 137, // Polygon - Deposit to Curve
      sequenceNonce: 200,
      sequence: {
        name: "Polygon Deposit",
        callData: [depositToCurveCallData],
        actionIds: [CURVE_SUPPLY_ACTION_ID]
      }
    }
  ]
};

// Sign and execute
const bundleHash = await module.getBundleHash(bundle);
const signature = await owner.signMessage(ethers.utils.arrayify(bundleHash));
await module.executeBundle(safeAddress, bundle, signature);
```