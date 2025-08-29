# Token Registry

The module and actions rely on a `TokenRegistry` to validate supported tokens in
sensitive flows (e.g., swaps and gas refunds).

## Purpose

- Enforce an allowlist for tokens involved in execution/refund paths.
- Provide only approval status to actions; gas refund pricing reads decimals from the token and price from Chainlink oracles directly.

## Usage

- Swaps must require the output token to be approved by `TokenRegistry`.
- Gas refunds require `refundToken` to be non-zero and approved by
  `TokenRegistry`.

## Operations

- Keep token updates governed through `AdminVault` processes where applicable.
- Prefer stablecoins and major assets for refunds to reduce price/oracle risk.
