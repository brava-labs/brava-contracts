# Testing Guide

This document reflects commands and paths in the monorepo. For this standalone repository, use the root README instructions. Active development is done in the monorepo; this repository tracks the public-facing current deployment.

This package uses Hardhat with mainnet forking for contract tests. Some
integration flows rely on external RPCs and real protocol state.

## Setup (Monorepo)

- Ensure monorepo `.env` contains valid RPCs and `DEV_MNEMONIC`.
- Hardhat config: `packages/contracts/hardhat.config.cjs` (forking uses
  `NEXT_PUBLIC_RPC_URL` when present; fork block is pinned).

## Commands (Monorepo)

```bash
# from repo root
pnpm --filter @brava/contracts test
pnpm --filter @brava/contracts coverage

# or inside packages/contracts
pnpm test
pnpm coverage
```

- Enable logging: `ENABLE_LOGGING=true pnpm test`
- Grep tests: `pnpm test -- --grep "Aave"`

## Patterns

- Prefer cached quote utilities when available (e.g., 0x) to avoid flaky API
  calls.
- Pin mainnet-fork blocks to align with cached data and whale balances.
- When impersonating whales, verify balances at the pinned block before running.

## Notes

- Tests involving the EIP-712 module require a Safe context; ensure the Safe is
  configured or deployed as part of the test.
- 0x/aggregator-based actions require correct calldata from the API; keep
  fixtures in sync with the target block.
- Mark tests dependent on volatile protocol state as skipped or guard them with
  environment checks.

## Environment caveats

- Whale balances: impersonated accounts may lack balances at the fork block;
  update the block or whale address.
- External APIs: services like Nexus Mutual and 0x can rate-limit or change
  responses.
- Protocol drift: token lists/pools change; align fork block with expected
  state.
- Safe modules: `GS013` and similar errors often indicate module
  enablement/config mismatches in tests.
