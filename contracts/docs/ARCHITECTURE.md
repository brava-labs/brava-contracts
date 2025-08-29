# Contract Architecture Overview

This document provides a comprehensive technical overview of the Brava smart
contract architecture, design patterns, and system interactions.

## 🏛️ Architecture Principles

### 1. Safe-Centric Design

The entire system is built around Safe smart wallets as the execution context.
Users maintain full custody of their funds, and all operations execute within
their Safe through delegate calls.

### 2. Modular Action System

Each protocol integration is implemented as a standalone action contract.
Actions follow a standardized interface and can be composed into complex
sequences.

### 3. Immutable Core, Upgradeable Periphery

Core logic contracts are immutable for security, while the AdminVault enables
upgrading action contracts and configurations through a governed process.

### 4. Deterministic Deployments

All contracts use CREATE2 for deterministic addresses across chains, enabling
consistent deployment patterns and address prediction.

## 📊 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           Brava Smart Contract System                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │  Safe Wallet    │    │  EIP712 Module   │    │      SafeDeployment         │ │
│  │  (User Context) │◄──►│  (Cross-Chain)   │◄──►│    (Automated Setup)        │ │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────────┘ │
│           │                                                                     │
│           ▼                                                                     │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │ SequenceExecutor│    │   AdminVault     │    │         Logger              │ │
│  │  (Orchestrator) │◄──►│  (Governance)    │◄──►│    (Event System)           │ │
│  └─────────────────┘    └──────────────────┘    └─────────────────────────────┘ │
│           │                       │                                             │
│           ▼                       ▼                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │                        Action Contracts                                    │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │ │
│  │  │   Aave V3   │ │  Yearn V3   │ │   Curve     │ │    Swap     │   ...     │ │
│  │  │  Supply     │ │   Supply    │ │   Supply    │ │  ParaSwap   │           │ │
│  │  │  Borrow     │ │  Withdraw   │ │  Withdraw   │ │   1inch     │           │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │ │
│  │                                                                             │ │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │ │
│  │  │   Utils     │ │    Cover    │ │   Common    │ │   Custom    │           │ │
│  │  │ PullToken   │ │   Nexus     │ │ TokenUtils  │ │   Actions   │           │ │
│  │  │ SendToken   │ │  Purchase   │ │ GasRefund   │ │             │           │ │
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │ │
│  └─────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## 🏗️ Core Components

### Safe Wallet (User Context)

- **Purpose**: Execution context for all user operations
- **Ownership**: User maintains full control and custody
- **Modules**: EIP712TypedDataSafeModule enabled for cross-chain execution
- **Pattern**: Standard Safe v1.3.0+ with threshold=1 (single owner)

```solidity
interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        Enum.Operation operation
    ) external returns (bool success);
}
```

### SequenceExecutor (Orchestrator)

- **Purpose**: Executes sequences of actions atomically
- **Pattern**: Delegate call to action contracts from Safe context
- **Security**: Only executes actions registered in AdminVault
- **Gas**: Optimized for multi-action execution

```solidity
struct Sequence {
    string name;           // Human-readable identifier
    bytes[] callData;      // Encoded parameters for each action
    bytes4[] actionIds;    // Action contract identifiers
}
```

**Execution Flow:**

1. Validate all action IDs exist in AdminVault
2. For each action: delegate call with provided callData
3. All operations execute in Safe context (msg.sender = Safe)
4. Atomic execution - all succeed or all revert

### AdminVault (Governance)

- **Purpose**: Central registry and permission management
- **Pattern**: Time-delayed proposals with role-based execution
- **Security**: Multi-role access control with mandatory waiting periods
- **Upgradeability**: Enables system evolution through action replacement

```solidity
// Core registries
mapping(bytes4 => address) public actionAddresses;           // Action registry
mapping(uint256 => mapping(bytes4 => address)) public protocolPools; // Pool registry
mapping(bytes32 => uint256) public proposedRoles;           // Role proposals

// Time-delayed governance
function proposeAction(bytes4 actionId, address actionAddress) external;
function addAction(bytes4 actionId, address actionAddress) external;
```

**Proposal System:**

1. **Propose**: Submit new action/pool/role with PROPOSER role
2. **Wait**: Mandatory delay period (configurable, default 24h)
3. **Execute**: Apply changes with EXECUTOR role
4. **Cancel**: Cancel proposals with CANCELER role
5. **Remove**: Remove existing items with DISPOSER role

### Logger (Event System)

- **Purpose**: Centralized event emission for actions and governance
- **Pattern**: Minimal event emitter
- **Categories**: Action events and AdminVault events
- **Standards**: Structured IDs for governance

```solidity
event ActionEvent(address caller, ActionBase.LogType logId, bytes data);
event AdminVaultEvent(uint256 logId, bytes data);
```

**Event ID Schema:**

- AdminVault: `ABC` format where A=operation (1=propose, 2=execute, 3=cancel,
  4=remove), BC=category (01=action, 02=pool, etc.)
- Actions: `LogType` enum values (1=balance_update, 2=buy_cover, etc.)

## 🎯 Action Contract Architecture

### ActionBase (Abstract Base)

All action contracts inherit from `ActionBase` which provides:

```solidity
abstract contract ActionBase {
    IAdminVault public immutable ADMIN_VAULT;
    ILogger public immutable LOGGER;

    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual;
    function actionType() public pure virtual returns (uint8);
    function protocolName() public pure virtual returns (string memory);
}
```

**Key Features:**

- **Fee Management**: Automatic fee calculation and collection
- **Event Logging**: Structured logging via centralized Logger
- **Validation**: Pool existence and action verification
- **Standard Interface**: Consistent execution pattern

### Action Categories

#### 1. Protocol Actions

Direct integrations with DeFi protocols:

- **Aave V2/V3**: Supply, borrow, withdraw, repay
- **Yearn V2/V3**: Deposit, withdraw vault shares
- **Curve**: Deposit to pools, claim rewards
- **Euler V2**: Vault operations
- **Morpho**: Lending operations

Example structure:

```
actions/aave-v3/
├── AaveV3Supply.sol      # Deposit assets to Aave
├── AaveV3Withdraw.sol    # Withdraw assets from Aave
└── AaveV3Borrow.sol      # Borrow against collateral
```

#### 2. Utility Actions

Common operations used across strategies:

- **PullToken**: Transfer tokens from Safe to protocol
- **SendToken**: Transfer tokens from protocol back to Safe
- **TokenSwap**: Exchange tokens via aggregators

#### 3. Swap Actions

DEX aggregator integrations:

- **ParaSwap**: Multi-DEX routing
- 0x and ParaSwap integrated in this repository; other aggregators may be added separately
- **Custom**: Direct DEX interactions

#### 4. Cover Actions

Insurance protocol integrations:

- **Nexus Mutual**: Purchase and manage cover
- **Custom**: Other insurance providers

### Action ID Generation

Actions are identified by 4-byte IDs derived from contract addresses:

```solidity
function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
    return bytes4(keccak256(abi.encodePacked(_addr)));
}
```

This creates unique, deterministic identifiers that link to specific contract
versions.

## 🔗 Execution Patterns

### Sequence Execution Details

- All actions execute via `delegatecall` so `address(this)` is the Safe.
- With bundle context and `IActionWithBundleContext` support (ERC165), call
  `executeActionWithBundleContext(callData, bundle, signature, strategyId)`.
- Otherwise call `IAction.executeAction(bytes callData, uint16 strategyId)`.
- Raw `callData` or an encoded `executeAction` selector are both supported; the
  executor extracts `(bytes, uint16)` when needed.
- Revert reasons from actions are propagated when available.

### Logging

- Actions emit `ActionEvent(caller, logId, data)` via the shared `Logger`.
- Governance emits `AdminVaultEvent(logId, data)` using a structured ID scheme:
  - 1XX = Proposal, 2XX = Execute/Grant, 3XX = Cancel, 4XX = Removal
  - Categories: 00=Delay, 01=Action, 02=Pool, 03=Fees, 04=Role, 05=Txn

### 1. Standard Execution

Direct sequence execution via Safe transaction:

```typescript
// Build sequence
const sequence = {
  name: 'Aave Supply Strategy',
  actionIds: [PULL_TOKEN_ID, AAVE_SUPPLY_ID],
  callData: [pullTokenCallData, aaveSupplyCallData],
};

// Execute via Safe
await safe.execTransactionFromModule(
  sequenceExecutor.address,
  0,
  sequenceExecutor.interface.encodeFunctionData('executeSequence', [sequence]),
  Enum.Operation.DelegateCall
);
```

### 2. Cross-Chain Execution

Multi-chain operations via EIP-712 signed bundles:

```typescript
// Create multi-chain bundle
const bundle = {
  expiry: timestamp + 3600,
  sequences: [
    { chainId: 1, sequenceNonce: 10, sequence: ethereumSequence },
    { chainId: 137, sequenceNonce: 5, sequence: polygonSequence },
  ],
};

// Sign once, execute anywhere
const signature = await signer._signTypedData(domain, types, bundle);
await eip712Module.executeBundle(safeAddress, bundle, signature);
```

### 3. Automated Deployment

Safe deployment integrated with execution:

```typescript
// Bundle with deployment flag
const bundle = {
  sequences: [
    {
      chainId: 1,
      sequenceNonce: 0,
      deploySafe: true, // Deploy Safe if needed
      sequence: firstSequence,
    },
  ],
};
```

## 🛡️ Security Model

### Access Control Hierarchy

```
OWNER_ROLE
├── ROLE_MANAGER_ROLE
│   ├── ACTION_PROPOSER_ROLE → ACTION_EXECUTOR_ROLE → ACTION_DISPOSER_ROLE
│   ├── POOL_PROPOSER_ROLE → POOL_EXECUTOR_ROLE → POOL_DISPOSER_ROLE
│   ├── FEE_PROPOSER_ROLE → FEE_EXECUTOR_ROLE → FEE_CANCELER_ROLE
│   └── TRANSACTION_PROPOSER_ROLE → TRANSACTION_EXECUTOR_ROLE → TRANSACTION_DISPOSER_ROLE
└── FEE_TAKER_ROLE
```

### Security Features

#### 1. Time-Delayed Governance

- All changes require proposal + waiting period + execution
- OWNER_ROLE can bypass delays for emergency response
- Different delay periods for different operation types

#### 2. Action Validation

- Actions must be registered in AdminVault before execution
- Protocol and action type verification via EIP-712 typed data
- Pool address validation prevents unauthorized interactions

#### 3. Safe-Native Security

- All operations execute within user's Safe context
- Users maintain custody throughout execution
- Module-based permissions (users control module enablement)

#### 4. Nonce Management

- Per-Safe sequence nonces prevent replay attacks
- Independent nonces per chain for cross-chain operations
- Monotonic incrementation ensures ordering

## 💾 Storage Patterns

### AdminVault Storage

```solidity
// Action registry: actionId => contractAddress
mapping(bytes4 => address) public actionAddresses;

// Pool registry: protocolId => poolId => poolAddress
mapping(uint256 => mapping(bytes4 => address)) public protocolPools;

// Proposal tracking: proposalId => timestamp
mapping(bytes32 => uint256) public actionProposals;
mapping(bytes32 => uint256) public poolProposals;

// Fee timestamps: userSafe => poolToken => timestamp
mapping(address => mapping(address => uint256)) public lastFeeTimestamp;
```

### EIP712 Module Storage

```solidity
// Sequence nonces per Safe
mapping(address => uint256) public sequenceNonces;

// Domain configuration
string public domainName;
string public domainVersion;
```

### Proxy Storage Gaps

Infrastructure contracts use storage gaps for upgrade safety:

```solidity
uint256[50] private __gap;  // Reserve storage slots
```

## 🔄 Upgrade Patterns

### 1. Action Replacement

- Propose new action with same ID
- Wait for time delay
- Execute replacement (old action becomes inaccessible)
- Existing sequences continue to work with new implementation

### 2. Infrastructure Upgrades

- Logger and SafeDeployment use proxy patterns
- Upgrades maintain storage layout compatibility
- AdminVault manages upgrade permissions

### 3. Safe Configuration Evolution

- SafeSetupRegistry enables configuration updates
- New Safes deploy with latest configuration
- Existing Safes can opt-in to new modules

## 📈 Gas Optimization Strategies

### 1. Delegate Call Pattern

- Actions execute in Safe context via delegate calls
- Minimal proxy overhead for sequence execution
- Storage operations occur in user's Safe

### 2. Batch Operations

- Multiple actions in single transaction
- Shared gas costs across operations
- Reduced external call overhead

### 3. Efficient Encoding

- Packed structs for calldata efficiency
- Optimized event encoding
- Minimal storage usage patterns

### 4. Gas Refund System

- Economic incentives for transaction execution
- Oracle-based fair pricing
- Configurable refund parameters

## 🧪 Testing Architecture

### Test Categories

1. **Unit Tests**: Individual contract functionality
2. **Integration Tests**: Multi-contract interactions
3. **End-to-End Tests**: Complete user flows
4. **Cross-Chain Tests**: Multi-chain scenarios

### Testing Tools

- **Hardhat**: Local development and testing
- **Tenderly**: Mainnet forking and debugging
- **TypeChain**: Type-safe contract interactions

### Test Patterns

```typescript
// Example test structure
describe('AaveV3Supply', () => {
  let setup: BaseSetup;

  before(async () => {
    setup = await getBaseSetup();
  });

  it('should execute supply action', async () => {
    const sequence = createSequence([PULL_TOKEN_ID, AAVE_SUPPLY_ID]);
    await executeSequence(setup.safe, sequence);
    // Verify results
  });
});
```

This architecture enables secure, scalable, and user-friendly DeFi automation
while maintaining the security guarantees that make Safe wallets the gold
standard for asset custody.
