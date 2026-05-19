# 0x Swap Action

`ZeroExSwap` integrates 0x API v2 via the Allowance Holder contract. It follows
the `ActionBase` interface and validates tokens through `TokenRegistry`.

## Constructor

```solidity
constructor(address adminVault, address logger, address allowanceTarget, address tokenRegistry);
```

- `allowanceTarget`: 0x Allowance Target (spender) address used for ERC20 approvals
- `tokenRegistry`: registry used to verify output tokens; only the output token is validated

## Params

```solidity
struct Params {
  address tokenIn;
  address tokenOut;
  uint256 fromAmount;
  uint256 minToAmount;
  address swapTarget;   // 0x Exchange/Router call target; may change over time independently of allowanceTarget
  bytes swapCallData;   // calldata from 0x API
}
```

## Execution

```solidity
function executeAction(bytes memory callData, uint16 strategyId) public override;
```

- Decodes `Params`, enforces non-zero amounts.
- Requires `TOKEN_REGISTRY.isApprovedToken(tokenOut)`; approves input token only to `ALLOWANCE_TARGET`, not to `swapTarget`. 
- Calls 0x with provided `swapCallData` and validates `minToAmount`.

## Notes

- Provide the exact 0x API calldata, and pass `swapTarget` equal to the chain’s
  Allowance Holder.
- Fees and timestamping are handled by `ActionBase` / `AdminVault` patterns
  present in the codebase.
