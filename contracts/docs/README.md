# Brava Smart Contracts Technical Documentation

This documentation provides comprehensive technical details about the Brava
smart contract system. The Brava protocol is a DeFi automation platform built
around Safe smart accounts, enabling secure, automated execution of complex
multi-step strategies across multiple protocols and chains.

## 📚 Documentation Index

### Core System Documentation

- **[Contract Architecture Overview](./ARCHITECTURE.md)** - Complete system
  architecture, design patterns, and contract interactions
- **[AdminVault System](./ADMIN_VAULT.md)** - Permission management, proposal
  system, and role-based access control
- **[Logging](./ARCHITECTURE.md)** - See Logging section within Architecture

### Advanced Features

- **[EIP-712 Typed Data Module](./TYPED_DATA_MODULE.md)** - Cross-chain
  signature system and bundle execution
- **[Safe Deployment System](./SAFE_DEPLOYMENT.md)** - Automated Safe deployment
  with typed data integration
- **[Gas Refund System](./GAS_REFUND_SYSTEM.md)** - Economic incentive system
  for transaction execution

### Development & Testing

- **[Testing Guide](./TESTING_GUIDE.md)** - Hardhat testing and methodologies
- **[ActionBase Implementer Guide](./ACTION_BASE.md)** - How to build actions
- **[Token Registry](./TOKEN_REGISTRY.md)** - Allowed token policy
- **[SafeSetupRegistry](./SAFE_SETUP_REGISTRY.md)** - Safe template
  configuration

## 🏗️ System Overview

The Brava smart contract system is built around these core principles:

### 1. Safe-Centric Architecture

All user operations execute within the context of their Safe smart wallet,
ensuring users maintain full custody of their funds. The system never takes
custody of user assets.

### 2. Modular Action System

Each protocol integration is implemented as a standalone action contract that
inherits from `ActionBase`. Actions can be composed into sequences for complex
multi-step operations.

### 3. Secure Governance

All system changes go through a time-delayed proposal system managed by the
`AdminVault`, with role-based permissions and transparent logging.

### 4. Cross-Chain Compatibility

The EIP-712 typed data system enables single-signature execution across multiple
chains, with automatic Safe deployment when needed.

## 🔧 Core Components

### AdminVault

Central registry and permission manager that controls:

- Action contract registration and updates
- Protocol pool whitelisting
- Fee configuration
- Role-based access control with time delays

### SequenceExecutor

Orchestrates execution of action sequences within Safe contexts using delegate
calls, enabling atomic multi-step operations.

### EIP712TypedDataSafeModule

Enables cross-chain bundle execution through EIP-712 signatures, with built-in
Safe deployment and gas refund capabilities.

### Action Contracts

Protocol-specific implementations that handle interactions with external DeFi
protocols (Aave, Yearn, Curve, etc.).

### Logger

Centralized event logging via a minimal emitter used by actions and governance
components.

## 🚀 Quick Start

### For Developers

1. Read the [Architecture Overview](./ARCHITECTURE.md) to understand the system
   design
2. Review [Testing Guide](./TESTING_GUIDE.md) for development setup
3. Explore individual protocol actions in `/contracts/actions/`

### For Integrators

1. Start with [Safe Deployment System](./SAFE_DEPLOYMENT.md) for user onboarding
2. Implement [EIP-712 Typed Data Module](./TYPED_DATA_MODULE.md) for cross-chain
   execution
3. Configure [Gas Refund System](./GAS_REFUND_SYSTEM.md) for economic incentives

### For Operators

1. Understand [AdminVault System](./ADMIN_VAULT.md) for protocol governance
2. Review the Logging section in [Architecture](./ARCHITECTURE.md) for event
   usage

## 🔒 Security Features

- **Time-delayed governance** - All protocol changes require waiting periods
- **Role-based permissions** - Granular access control for different operations
- **Safe-native execution** - All operations within user's own Safe wallet
- **Action validation** - Cryptographic verification of action definitions
- **Nonce management** - Prevention of replay attacks across chains
- **Gas refund protection** - Economic safeguards against manipulation

## 🌐 Cross-Chain Design

The system is designed for multi-chain deployment with:

- **Deterministic deployments** - Same addresses across chains using CREATE2
- **Chain-agnostic signatures** - EIP-712 domain uses chainId=1 for
  compatibility
- **Nonces** - Per-Safe sequence tracking on the module
- **Automatic deployment** - Safes deployed when needed on new chains

## 📊 Gas Optimization

- **Batch operations** - Multiple actions in single transaction
- **Delegate call pattern** - Minimal proxy overhead
- **Gas refund system** - Economic incentives for execution
- **Optimal storage usage** - Efficient state management

## 🔄 Upgradeability

The system supports upgrades through:

- **Proxy patterns** - For core infrastructure contracts
- **Action replacement** - New protocol versions via AdminVault
- **Configuration updates** - Safe setup template evolution
- **Backward compatibility** - Existing Safes continue to function

## 🎯 Design Goals

1. **Security First** - No custody, time delays, comprehensive validation
2. **User Experience** - Single signature, automatic deployment, gas refunds
3. **Developer Experience** - Modular actions, comprehensive testing, clear
   documentation
4. **Scalability** - Cross-chain support, efficient gas usage, batch operations
5. **Composability** - Standard interfaces, modular design, protocol agnostic

## 📈 Usage Patterns

### Basic Action Execution

```solidity
// Single action via Safe
safe.execTransactionFromModule(
    sequenceExecutor,
    0,
    abi.encodeCall(SequenceExecutor.executeSequence, (sequence)),
    Enum.Operation.DelegateCall
);
```

### Cross-Chain Bundle

```typescript
// Multi-chain execution via typed data
const bundle = {
  expiry: timestamp + 3600,
  sequences: [
    { chainId: 1, sequenceNonce: 10, sequence: ethereumOps },
    { chainId: 137, sequenceNonce: 5, sequence: polygonOps },
  ],
};
const signature = await signer._signTypedData(domain, types, bundle);
await eip712Module.executeBundle(safeAddress, bundle, signature);
```

## 🛠️ Development Tools

- **Hardhat** - Local development and testing
- **Tenderly** - Mainnet forking and debugging
- **TypeChain** - Type-safe contract interactions
- **OpenZeppelin** - Security-audited base contracts
- **CreateX** - Deterministic deployments

## 📞 Support

- **Security Issues**: security@bravalabs.xyz
- **Documentation**: Comprehensive guides in this `/docs` folder
- **Examples**: Reference implementations in `/tests` folder
- **Community**: [Brava Labs GitHub](https://github.com/brava-labs)

---

Each document in this suite provides detailed technical information for specific
aspects of the system. Start with the Architecture Overview for a complete
picture, then dive into specific components as needed.
