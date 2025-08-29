# Gas Refund System

The EIP-712 module can refund gas costs in a configured ERC-20 token when
enabled for a sequence. Refunds are optional per-chain sequence and never revert
the main execution.

## Configuration (typed data)

```
ChainSequence {
  enableGasRefund: bool,
  refundToken: address,      // must be a supported ERC-20
  maxRefundAmount: uint256,  // 0 means unlimited
  refundRecipient: uint8     // 0=executor, 1=fee recipient
}
```

- `refundToken` must be non-zero and approved by `TokenRegistry`.
- `refundRecipient` uses numeric values in typed data; the action interprets these values.
- The module validates typed-data declarations for action metadata. It checks for the presence of at least one `FEE_ACTION` to allow explicit opt-in to fee actions via signatures. Position is not enforced; sequences should generally place fee actions at the end for clarity.

## Execution Flow

- Module records `gasStart` and the executor before executing the sequence. The executor is the EOA captured as `tx.origin`.
- Refunds are executed by a dedicated `GasRefundAction` appended near the end of the sequence.
- The module enforces that when `enableGasRefund=true`, at least one `FEE_ACTION` is present; when `false`, no `FEE_ACTION` may be present.
- The action consumes context via `consumeGasContext()` and transfers tokens from the Safe. Refund failures do not affect the main flow.

## Calculation

Refunds are calculated in the action using on-chain oracle pricing, action callData parameters, and module-supplied context, then capped by `maxRefundAmount`.

Key inputs:

- `startGas` and `gasleft()` captured just-in-time
- `refundToken` (must be supported)
- `executor` and `feeRecipient`
- `TokenRegistry` and `ETH_USD` oracle
- Oracle decimals are read from the configured feed
- Oracle safeguards: non-positive prices are ignored; updates older than 1 hour are ignored; an additional 21,000 gas overhead is included in the calculation

## Events / Logging

- Gas refund results are logged via the centralized `Logger` using `LogType.GAS_REFUND` with payload `(safe, refundToken, refundAmount, recipient)`.

## Guidance

- Prefer stablecoins as `refundToken`.
- Set reasonable `maxRefundAmount` per chain to limit exposure.
- Monitor `LogType.GAS_REFUND` action logs to track refund spend and recipients.
