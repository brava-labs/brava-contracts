# Portfolio Update with TypedData Testing

This document describes the testing implementation for the
`portfolioUpdateToSequenceWithTokenAmounts` function from the `brava-ts-client`
and its integration with EIP-712 typed data execution.

## Overview

The portfolio update functionality allows users to:

1. **Define token deposits**: Specify which tokens they want to deposit into
   their portfolio
2. **Set target portfolio**: Define the desired final state of their portfolio
   across different protocols
3. **Generate sequences**: Automatically create optimized action sequences to
   achieve the portfolio transformation
4. **Execute with TypedData**: Use EIP-712 signed bundles for secure, efficient
   execution

## Test Structure

### Files Created

- **`test/portfolio-update.test.ts`**: Main test file demonstrating portfolio
  update functionality

### Key Components



1. **Portfolio Update Test** (`test/portfolio-update.test.ts`):
   ```typescript
   // Demonstrates:
   // - Using portfolioUpdateToSequenceWithTokenAmounts()
   // - Converting sequences to TypedData format
   // - Creating and signing EIP-712 bundles
   ```

## Test Scenarios

### Test 1: Basic Sequence Generation

- **Goal**: Verify that `portfolioUpdateToSequenceWithTokenAmounts` correctly
  generates action sequences
- **Setup**: 1000 USDC deposit targeting Fluid V1 protocol
- **Validation**:
  - Sequence contains expected actions (PullToken + ERC4626Supply)
  - TypedData structure is properly formatted
  - Action counts match between sequence and typed data

### Test 2: Bundle Creation and Signing

- **Goal**: Demonstrate EIP-712 bundle creation and signing workflow
- **Setup**: 500 USDC deposit targeting Fluid V1 protocol
- **Validation**:
  - Bundle structure is correct
  - EIP-712 signature is generated successfully
  - Bundle can be prepared for execution

## Key Technical Details

### Types Used

```typescript
// From brava-ts-client
Balance: { asset: Asset, amount: bigint }
Asset: 'USDC' | 'USDT' | 'DAI' | ... // String literal types
Portfolio: { positions: Position[] }
Position: { pool: Pool, amount: bigint, strategyId: number }
Sequence: Class with actions and typed data conversion methods
```

### Portfolio Update Flow

1. **Input Validation**: Validate current/target portfolios and token deposits
2. **Delta Calculation**: Calculate the difference between current and target
   states
3. **Action Generation**: Create ordered actions (deposits → withdrawals → swaps
   → protocol deposits)
4. **Sequence Creation**: Wrap actions in a Sequence object
5. **TypedData Conversion**: Convert to EIP-712 compatible format
6. **Bundle Creation**: Package into a Bundle for execution
7. **Signing**: Generate EIP-712 signature for the bundle

### Action Types Generated

Based on the test output, the portfolio update generates:

- **PullTokenAction**: Transfers tokens from user to Safe
- **ERC4626SupplyAction**: Deposits tokens into the target protocol (Fluid V1)

## Running the Tests

```bash
# Run the portfolio update tests
npm test -- --grep "Portfolio Update"

# Run with detailed logging
ENABLE_LOGGING=true npm test -- --grep "Portfolio Update"
```

## Integration Points

### With Existing Infrastructure

- Uses existing `getBaseSetup()` for test environment
- Leverages `utils-eip712.ts` for bundle creation and signing
- Integrates with `SafeDeployment` and `EIP712TypedDataSafeModule` contracts

### With brava-ts-client

- Direct usage of `portfolioUpdateToSequenceWithTokenAmounts` function
- Proper type definitions for Balance, Portfolio, Asset, etc.
- Conversion between Sequence and TypedDataSequence formats

## Benefits of This Approach

1. **Type Safety**: Full TypeScript support with proper interfaces
2. **Realistic Testing**: Uses actual portfolio optimization logic from
   ts-client
3. **EIP-712 Integration**: Demonstrates complete typed data workflow
4. **Maintainability**: Easy to extend for additional portfolio scenarios
5. **Development Workflow**: Script automation for package management

## Future Enhancements

- Add tests for complex multi-protocol rebalancing
- Test error scenarios (insufficient funds, invalid pools, etc.)
- Add execution tests that actually run the transactions
- Test with different asset types and protocols
- Add performance benchmarking for large portfolios

This testing framework provides a solid foundation for validating portfolio
update functionality and serves as documentation for how to use the portfolio
optimization features with typed data execution.
