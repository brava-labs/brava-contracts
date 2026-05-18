# Brava Smart Contracts

This repository contains the smart contracts for the Brava protocol - a composable DeFi execution system built on Safe smart accounts.

> **Note:** Active development occurs in our private monorepo. This repository serves as a public mirror, updated after significant releases and security audits to maintain transparency with the community.

## Overview

Brava enables complex, multi-step DeFi operations to be executed atomically in a single transaction through user-owned Safe smart wallets. The architecture provides secure, non-custodial portfolio management with composable actions across multiple DeFi protocols.

### Key Features

- **Non-Custodial**: All operations execute within user-owned Safe wallets
- **Composable**: Chain multiple DeFi actions into single atomic transactions
- **Cross-Chain**: Deterministic Safe deployment and cross-chain execution via CCTP
- **Modular**: Extensible action system for integrating new protocols
- **Secure**: EIP-712 typed data signatures with co-signer threshold enforcement

### Execution Flow

1. Users sign EIP-712 typed data bundles off-chain containing action sequences
2. Relayers submit signed bundles to the EIP712TypedDataSafeModule
3. The module verifies signatures, co-signer thresholds, expiry, and nonce validity
4. SequenceExecutor executes the action sequence via delegatecall from the user's Safe
5. Optional gas refund mechanism reimburses transaction costs in USDC

## Contract Structure

```
contracts/
├── Errors.sol                  # Shared error definitions
├── Logger.sol                  # Centralized event logging
├── SequenceExecutor.sol        # Core execution engine
├── actions/                    # Protocol-specific action implementations
│   ├── ActionBase.sol          # Base contract for all actions
│   ├── aave-v3/               # Aave V3 supply/withdraw
│   ├── across-v3/             # Across bridge supply/withdraw
│   ├── cctp/                  # Circle CCTP bridging
│   ├── common/                # Shared action patterns (ERC4626, Aave, Compound)
│   ├── curve-savings/         # Curve savings supply/withdraw
│   ├── euler-v2/              # Euler V2 supply/withdraw
│   ├── fluid-v1/              # Fluid V1 supply/withdraw
│   ├── gearbox-passive-v3/    # Gearbox Passive V3 supply/withdraw
│   ├── maple-v1/              # Maple Finance supply/withdraw queue
│   ├── morpho-markets/        # Morpho Blue markets supply/withdraw
│   ├── morpho-v1/             # Morpho V1 vault supply/withdraw
│   ├── morpho-vault-v2/       # Morpho Vault V2 supply/withdraw
│   ├── nexus-mutual/          # Nexus Mutual cover purchase
│   ├── sky-v1/                # Sky (formerly MakerDAO) savings supply/withdraw
│   ├── spark-v1/              # Spark V1 supply/withdraw
│   ├── swap/                  # DEX aggregator integrations (Paraswap, 0x, Curve)
│   ├── utils/                 # Utility actions (PullToken, SendToken, GasRefund, etc.)
│   ├── vesper-v1/             # Vesper V1 supply/withdraw
│   ├── yearn-v2/              # Yearn V2 supply/withdraw
│   └── yearn-v3/              # Yearn V3 supply/withdraw
├── auth/                       # Access control and Safe integration
│   ├── AccessControlDelayed.sol
│   ├── AdminVault.sol          # Central registry and governance
│   ├── AuthRegistry.sol        # Cross-chain auth propagation registry
│   ├── BravaGuard.sol          # Safe transaction guard
│   ├── BravaModuleLookup.sol   # Module discovery helper
│   ├── EIP712TypedDataSafeModule.sol  # Signed bundle execution module
│   ├── EmergencyWithdrawModule.sol    # Emergency withdrawal capability
│   ├── Proxy.sol               # ERC1967 proxy wrapper
│   ├── Roles.sol               # Role definitions
│   ├── SafeDeployment.sol      # Deterministic Safe deployment
│   ├── SafeSetup.sol           # Safe initialization helper
│   ├── SafeSetupRegistry.sol   # Safe configuration registry
│   └── TokenRegistry.sol       # Approved token allowlist
├── interfaces/                 # Contract interfaces
├── libraries/                  # Shared libraries (EIP712, Enum, token addresses)
└── docs/                       # Technical documentation
archive/                        # Deprecated protocol integrations (for reference)
```

## Getting Started

To compile the contracts:

```bash
npm install
npx hardhat compile
```

Solidity `0.8.28` with optimizer enabled (1M runs, EVM target `paris`).

## Documentation

Detailed technical documentation is available in [`contracts/docs/`](contracts/docs/):

- [Architecture Overview](contracts/docs/ARCHITECTURE.md)
- [Action Base Documentation](contracts/docs/ACTION_BASE.md)
- [AdminVault Documentation](contracts/docs/ADMIN_VAULT.md)
- [EIP-712 Typed Data Module](contracts/docs/TYPED_DATA_MODULE.md)
- [Safe Deployment System](contracts/docs/SAFE_DEPLOYMENT.md)
- [Safe Setup Registry](contracts/docs/SAFE_SETUP_REGISTRY.md)
- [Gas Refund System](contracts/docs/GAS_REFUND_SYSTEM.md)
- [Token Registry](contracts/docs/TOKEN_REGISTRY.md)
- [CCTP Receive Flow](contracts/docs/CCTP_RECEIVE_FLOW_IMPLEMENTATION.md)
- [0x Swap Integration](contracts/docs/ZERO_X_IMPLEMENTATION.md)
- [Deterministic Proxy Deployment](contracts/docs/DETERMINISTIC_PROXY_DEPLOYMENT.md)

## Security Audits

Previous audit reports by [Sigma Prime](https://sigmaprime.io/):

- [Core Protocol Audit](https://github.com/sigp/public-audits/blob/master/reports/brava/report.pdf)
- [Module Integrations Add-on Audit](https://github.com/sigp/public-audits/blob/master/reports/brava/module-integrations/report.pdf)

See the [`audits/`](audits/) directory for full details. We prioritize security and transparency, working with leading audit firms to ensure the safety of user funds.

## License

This project is dual-licensed:

- **Primary License**: [Business Source License 1.1 (BUSL-1.1)](LICENSE.md)
- **Change License**: [MIT License](LICENSE-MIT.md)

### License Summary

- Development and testing are freely permitted
- Production use requires a commercial license subject to the platform fee schedule (see LICENSE.md and https://brava.finance)
- Each version automatically converts to MIT License 4 years after its first public release

The BUSL-1.1 license balances open development with sustainable protocol growth, ensuring all versions eventually become fully open source.

## Contact

For questions, issues, or security concerns, please open an issue in this repository.
