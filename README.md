# Brava Smart Contracts

This repository contains the smart contracts for the Brava protocol - a composable DeFi execution system built on Safe smart accounts.

> **Note:** Active development occurs in our private monorepo. This repository serves as a public mirror, updated after significant releases and security audits to maintain transparency with the community.

## Overview

Brava enables complex, multi-step DeFi operations to be executed atomically in a single transaction through user-owned Safe smart wallets. The architecture provides secure, non-custodial portfolio management with composable actions across multiple DeFi protocols.

### Key Features

- **Non-Custodial**: All operations execute within user-owned Safe wallets
- **Composable**: Chain multiple DeFi actions into single atomic transactions
- **Cross-Chain**: Deterministic Safe deployment and cross-chain execution support
- **Modular**: Extensible action system for integrating new protocols
- **Secure**: EIP-712 typed data signatures with replay protection

## Architecture

The Brava protocol is built on several key components:

- **SequenceExecutor**: Orchestrates the execution of multi-step action sequences
- **Actions**: Protocol-specific contracts for interacting with DeFi protocols (deposits, withdrawals, swaps, etc.)
- **AdminVault**: Central registry managing available actions and system configuration
- **EIP712TypedDataSafeModule**: Safe module for validating and executing signed bundles
- **SafeDeployment**: Deterministic Safe deployment system for consistent cross-chain addresses
- **Logger**: Centralized event logging for analytics and traceability

For detailed architectural information, see the [Architecture Documentation](contracts/docs/ARCHITECTURE.md).

### Execution Flow

1. Users sign EIP-712 typed data bundles off-chain containing action sequences
2. Relayers or dApps submit signed bundles to the EIP712TypedDataSafeModule
3. The module verifies signatures, expiry, and nonce validity
4. SequenceExecutor executes the action sequence via delegatecall from the user's Safe
5. Optional gas refund mechanism reimburses transaction costs

## Contract Structure

```
contracts/
├── actions/              # Protocol-specific action implementations
│   ├── aave-v2/         # Aave V2 integration
│   ├── aave-v3/         # Aave V3 integration
│   ├── across-v3/       # Across bridge integration
│   ├── cctp/            # Circle CCTP integration
│   ├── common/          # Shared actions (SendToken, WrapETH, etc.)
│   ├── swap/            # DEX aggregator integrations
│   └── ...              # Additional protocol integrations
├── auth/                # Access control and Safe-related contracts
├── interfaces/          # Contract interfaces
├── libraries/           # Shared libraries and utilities
└── SequenceExecutor.sol # Core execution engine
```

## Documentation

Detailed documentation is available in the [`contracts/docs/`](contracts/docs/) directory:

- [Architecture Overview](contracts/docs/ARCHITECTURE.md)
- [Action Base Documentation](contracts/docs/ACTION_BASE.md)
- [AdminVault Documentation](contracts/docs/ADMIN_VAULT.md)
- [EIP-712 Typed Data Module](contracts/docs/TYPED_DATA_MODULE.md)
- [Safe Deployment System](contracts/docs/SAFE_DEPLOYMENT.md)
- [Gas Refund System](contracts/docs/GAS_REFUND_SYSTEM.md)
- [Token Registry](contracts/docs/TOKEN_REGISTRY.md)

## Security Audits

Security audit reports are available in the [`audits/`](audits/) directory. We prioritize security and transparency, working with leading audit firms to ensure the safety of user funds.

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

---

Built with ❤️ by Brava Labs
