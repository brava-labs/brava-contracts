## Audit v2 Cheat Sheet

This document highlights the key areas of the Brava smart contract system ahead of the second audit. It provides a high-signal overview with references to detailed documentation.

- **Cross-chain execution via CCTP**: Primary bridging path using Circle CCTP; additional bridges planned. See `CCTP_RECEIVE_FLOW_IMPLEMENTATION.md`.
- **Typed data bundle execution**: EIP-712 domain uses `chainId=1` and the user Safe as `verifyingContract`. Replay protection is enforced via per-chain sequences and nonces. See `TYPED_DATA_MODULE.md`.
- **Deterministic Safe deployment**: Same Safe address across chains with just-in-time deployment; single-owner Safes; config applied from `SafeSetupRegistry`. See `SAFE_DEPLOYMENT.md` and `SAFE_SETUP_REGISTRY.md`.
- **Gas refund system**: Optional token-based refunds (typically USDC) to `tx.origin` or a fee recipient, enforced only for typed-data executions. See `GAS_REFUND_SYSTEM.md`.
- **Safe alignment/upgrade**: Uniform, governed Safe configuration (modules, guard, fallback) with an upgrade action that aligns a user Safe to the current template.
- **0x (ZeroEx) integration**: Swap action validates output token via `TokenRegistry` and supports exact-out expectations. See `ZERO_X_IMPLEMENTATION.md`.
- **Token allowlist**: Sensitive flows (swaps, refunds) gated by `TokenRegistry`. See `TOKEN_REGISTRY.md`.
- **Monorepo and maintenance**: Active development occurs in a monorepo. This repository mirrors the contracts; tests and other artifacts here are auxiliary and may not be fully maintained.
- **Docs note**: Documentation is authored and maintained for AI agents; it is intentionally terse and reference-oriented.

### Cross-Chain Model (CCTP)

- Uses Circle CCTP to burn USDC on a source chain and mint on a destination after attestation.
- Source flow sets `destinationCaller` and `recipient`; destination flow submits `{message, attestation}` to `MessageTransmitter.receiveMessage`.
- Off-chain infra is responsible for fetching attestations and forwarding messages; on-chain actions complete the receive flow.
- Deployments are designed so that the user’s Safe address remains consistent across chains, enabling bridging even before a Safe exists on the destination (combined with deterministic deployment).
- Reference: `CCTP_RECEIVE_FLOW_IMPLEMENTATION.md`.

### Typed Data Bundle Execution

- Domain separator: `chainId=1` and `verifyingContract = user Safe` to keep a consistent signing context across chains.
- Replay protection: bundles carry multiple `ChainSequence` entries, and the module selects the one matching `block.chainid` and the expected per-Safe nonce.
- Execution path: module validates action metadata, optionally deploys the Safe, and executes via the Safe into `SequenceExecutor` using `delegatecall`.
- Gas refund gating: when enabled, a fee action must be present; when disabled, fee actions are forbidden.
- Broadcaster compatibility: some broadcasters expect the verifying contract to be the module; the system uses the Safe as verifier by design.
- Reference: `TYPED_DATA_MODULE.md`.

### Safe Deployment and Setup

- Deterministic addresses via `CREATE2` over an EIP-1167 Safe proxy with salt derived from the user address.
- Just-in-time deployment: if a destination chain Safe is missing, the module can deploy it on first use.
- Single-owner Safes with threshold `1`; multi-owner support is out of scope for the current version.
- Post-deploy configuration: modules, guard, and fallback are applied atomically from `SafeSetupRegistry`.
- Reference: `SAFE_DEPLOYMENT.md`, `SAFE_SETUP_REGISTRY.md`.

### Gas Refunds

- Applies only to typed-data executions; the module records `startGas` and executor context.
- Refunds are computed in a dedicated action using oracle pricing and capped by `maxRefundAmount`.
- Recipient can be `tx.origin` (executor) or the configured fee recipient, facilitating both self- and third-party broadcasting.
- Refund failures do not revert the main sequence; results are logged via the centralized `Logger`.
- Reference: `GAS_REFUND_SYSTEM.md`.

### Safe Alignment / Upgrade

- A governed, canonical Safe configuration (modules, guard, fallback) is maintained in `SafeSetupRegistry`.
- The upgrade action brings any user Safe into alignment with the current template regardless of prior state.
- Reference: `SAFE_SETUP_REGISTRY.md`, see Architecture docs for governance and logging.

### 0x (ZeroEx) Swap Integration

- Action integrates with the 0x Allowance Target; approvals are scoped to the spender, not arbitrary targets.
- Output token must be approved by `TokenRegistry`; input/output amounts are validated on-chain, supporting exact-out style expectations from 0x quotes.
- Reference: `ZERO_X_IMPLEMENTATION.md`, `TOKEN_REGISTRY.md`.

### Assumptions and Limitations

- **Single-owner Safes**: Current deployment path and upgrade alignment assume a single owner and threshold `1`.
- **Typed-data domain**: `chainId=1` with `verifyingContract = Safe` is intentional to unify signing context across chains.
- **Nonce scope**: Nonces are tracked per Safe on the typed data module and are consumed on successful execution.
- **Refund token policy**: Refund token must be non-zero and approved by `TokenRegistry`; stablecoins are preferred.
- **Off-chain dependencies**: The bridging flow depends on Circle attestations; relaying is off-chain.
- **Broadcaster expectations**: Some third-party broadcasters may expect the module as the verifier; the system uses the Safe as verifier.
- **Bridge scope**: CCTP is the primary bridge; architecture is designed to support additional bridges in future iterations.

### Monorepo and Maintenance

- Brava now develops actively in a monorepo. This repository is a synchronized copy of the contracts.
- Tests and tooling in this repository are provided for assistance and reference; they are not the source of truth and may lag the monorepo.
- The contracts are authoritative; consult the monorepo for latest end-to-end tests, scripts, and infra.

### References

- Overview: `README.md` and `ARCHITECTURE.md`
- Cross-chain receive: `CCTP_RECEIVE_FLOW_IMPLEMENTATION.md`
- Typed-data module: `TYPED_DATA_MODULE.md`
- Safe deployment: `SAFE_DEPLOYMENT.md`
- Safe template/config: `SAFE_SETUP_REGISTRY.md`
- Gas refunds: `GAS_REFUND_SYSTEM.md`
- Token allowlist: `TOKEN_REGISTRY.md`
- 0x integration: `ZERO_X_IMPLEMENTATION.md`
