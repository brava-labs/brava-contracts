# Brava Contracts Documentation

Core technical documentation for the Brava smart contract system.

## Architecture

**[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture overview

Core system components and how they interact.

## Core Contracts

- **[ACTION_BASE.md](./ACTION_BASE.md)** - Base contract for all actions
- **[ADMIN_VAULT.md](./ADMIN_VAULT.md)** - Configuration and action registry
- **[TYPED_DATA_MODULE.md](./TYPED_DATA_MODULE.md)** - EIP-712 typed data execution module
- **[TOKEN_REGISTRY.md](./TOKEN_REGISTRY.md)** - Approved token allowlist

## Safe Integration

- **[SAFE_DEPLOYMENT.md](./SAFE_DEPLOYMENT.md)** - Deterministic Safe deployment
- **[SAFE_SETUP_REGISTRY.md](./SAFE_SETUP_REGISTRY.md)** - Safe configuration registry

## Features

- **[GAS_REFUND_SYSTEM.md](./GAS_REFUND_SYSTEM.md)** - Optional USDC gas refunds
- **[CCTP_RECEIVE_FLOW_IMPLEMENTATION.md](./CCTP_RECEIVE_FLOW_IMPLEMENTATION.md)** - Circle CCTP bridge integration
- **[ZERO_X_IMPLEMENTATION.md](./ZERO_X_IMPLEMENTATION.md)** - 0x swap integration

## Development

- **[DETERMINISTIC_PROXY_DEPLOYMENT.md](./DETERMINISTIC_PROXY_DEPLOYMENT.md)** - CreateX deployment guide
- **[TESTING_GUIDE.md](./TESTING_GUIDE.md)** - How to test contracts

## Quick Links

### For Developers

- **New action?** → Start with [ACTION_BASE.md](./ACTION_BASE.md)
- **Deploy contracts?** → See [DETERMINISTIC_PROXY_DEPLOYMENT.md](./DETERMINISTIC_PROXY_DEPLOYMENT.md) and `../../scripts/README.md`
- **Run tests?** → See [TESTING_GUIDE.md](./TESTING_GUIDE.md)

### For Auditors

- Start with [ARCHITECTURE.md](./ARCHITECTURE.md)
- Review [TYPED_DATA_MODULE.md](./TYPED_DATA_MODULE.md) for execution flow
- Check [GAS_REFUND_SYSTEM.md](./GAS_REFUND_SYSTEM.md) for refund mechanism
- See [CCTP_RECEIVE_FLOW_IMPLEMENTATION.md](./CCTP_RECEIVE_FLOW_IMPLEMENTATION.md) for cross-chain

### For Integrators

- Supported chains: See `../../scripts/deployments/`
- Contract addresses: See `../../scripts/deployments/*.json`
- Action types: See [ACTION_BASE.md](./ACTION_BASE.md)
- Approved tokens: Managed via [TOKEN_REGISTRY.md](./TOKEN_REGISTRY.md)

## Documentation Philosophy

- **Living documents** - Updated as the system evolves
- **Reference-oriented** - Technical specifics, not tutorials
- **No version history** - Describes current state only
- **AI-friendly** - Terse and structured for LLMs

## Need Help?

- Contract code: `../`
- Deployment scripts: `../../scripts/`
- Tests: `../../test/`
- Session notes: `../../SESSION_SUMMARY.md`
