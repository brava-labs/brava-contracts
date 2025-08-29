# ActionBase: Implementer Guide

Actions implement protocol-specific operations and run via `delegatecall` in the
Safe context.

## Contract shape

- Inherit `ActionBase` and implement:
  - `function executeAction(bytes memory callData, uint16 strategyId) public payable override`
  - `function actionType() public pure override returns (uint8)`
  - `function protocolName() public pure override returns (string memory)`

## AdminVault lookups

- Resolve pools via `ADMIN_VAULT` to ensure the pool is whitelisted.
- Action IDs are `bytes4` keys resolved by
  `AdminVault.getActionAddress(actionId)` in the executor.

## Token policy

- Use `address(this)` for balances/transfers; actions run in the Safe context.
- Use `TokenRegistry` where applicable (e.g., output token validation in swaps).
- Do not assume prior approvals; the Safe owns the funds and approvals are
  handled within actions when required.

## Fees & timestamps

- Respect fee-related utilities provided by the base library when applicable and
  update timestamping according to the pattern used in the codebase (e.g.,
  `AdminVault.lastFeeTimestamp`).

## Logging

- Emit concise structured logs via
  `LOGGER.logActionEvent(LogType logType, bytes data)`.
- Keep payloads small and typed with ABI encoding.

## Errors

- Prefer custom errors from `Errors.sol` to keep reverts gas-efficient and
  clear.

## Testing

- Fund the Safe with required tokens.
- Verify that `address(this)` resolves to the Safe in action code paths.
- Include negative cases (invalid pool/token, insufficient output, etc.).
