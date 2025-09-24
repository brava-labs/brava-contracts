# Gas Refund System

The EIP-712 module can refund gas costs in a configured ERC-20 token when
enabled for a sequence. Refunds are optional per-chain sequence and never revert
the main execution.

## Configuration (typed data)

```
ChainSequence {
  enableGasRefund: bool,
  maxRefundAmount: uint256,  // 0 means unlimited
  refundRecipient: uint8     // 0=executor, 1=fee recipient
}
```

- Refunds are settled in USDC. The refund action deposits USDC from the Safe to the module up to `maxRefundAmount`.
- `refundRecipient` uses numeric values in typed data and is resolved in the module.
- The module validates typed-data declarations for action metadata. It checks for the presence of at least one `FEE_ACTION` to allow explicit opt-in to fee actions via signatures. Position is not enforced; sequences should generally place fee actions at the end for clarity.

## Execution Flow

- The module records `gasStart` at entry, then executes the sequence via the Safe.
- A dedicated `GasRefundAction` transfers USDC from the Safe to the module (capped), acting as the explicit user-approved funding step.
- When `enableGasRefund=true`, the module requires at least one `FEE_ACTION` in the sequence; when `false`, no `FEE_ACTION` may be present.
- After the sequence completes, the module computes the refund amount and pays the selected recipient. Any leftover USDC held by the module after paying is returned to the Safe.
- Refund failures and insufficent deposit do not affect the main flow.

## Calculation

Refunds are calculated in the module using a chain-specific gas price adaptor and capped by the typed-data `maxRefundAmount`.

Key inputs:

- `gasUsed = gasStart - gasleft() + gasRefundOverhead`
- USDC token address configured at initialization
- Recipient selection: `0 = tx.origin` (executor EOA), `1 = fee recipient`
- Gas pricing via adaptor: `totalWeiCost(gasUsed, outerTxCalldata)` and token conversion using the adaptor's configured Chainlink feed
- Oracle safeguards reside in the adaptor (e.g., non-positive prices ignored, staleness checks)
- `gasRefundOverhead` is included to account for pre/post-execution overhead (default 21,000)

### Gas Price Adaptors

Adaptors implement `IGasPriceAdaptor` and can be swapped per-chain. Each adaptor returns the total wei cost for the current transaction, abstracting chain-specific details (EIP-1559 tips, L1 data fees, L2 pricing):

- EIP-1559: `Eip1559GasPriceAdaptor` uses `block.basefee + fixedPriorityFeeWei` plus Chainlink conversion
- OP Stack: `OpStackGasPriceAdaptor` combines `gasPrice()` with `getL1Fee(outerTxCalldata)`
- Arbitrum: `ArbitrumGasPriceAdaptor` uses `perArbGasWei` from `ArbGasInfo.getPricesInWei()`

Note: If the outer transaction calldata is needed (e.g., OP Stack), the adaptor API supports passing it; the module forwards `msg.data` for this purpose.

## Events / Logging

- Gas refund results are logged via the module event `GasRefundProcessed(safe, refundToken, refundAmount, recipient)` and actions may log via `Logger` using `LogType.GAS_REFUND`.

## Guidance

- Prefer stablecoins as refund tokens and add them to the registry for actions that fund refunds.
- Set reasonable `maxRefundAmount` per chain to limit exposure.
- Consider setting a non-zero `maxRefundAmount` whenever gas refunds are enabled to avoid unlimited refunds.
- Monitor module events and `LogType.GAS_REFUND` logs to track refund spend and recipients.
