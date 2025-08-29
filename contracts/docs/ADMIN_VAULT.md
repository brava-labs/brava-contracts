# AdminVault System

The AdminVault is the central governance and registry contract for the Brava
protocol. It manages permissions, maintains registries of approved actions and
pools, and implements a time-delayed proposal system for security.

## 🏛️ Architecture Overview

The AdminVault combines three core functions:

1. **Registry Management**: Actions, pools, and fee configurations
2. **Access Control**: Role-based permissions with time delays
3. **Fee Management**: Protocol fee collection and timestamps

```solidity
contract AdminVault is AccessControlDelayed, Multicall {
    // Core registries
    mapping(bytes4 => address) public actionAddresses;
    mapping(uint256 => mapping(bytes4 => address)) public protocolPools;
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // Proposal tracking
    mapping(bytes32 => uint256) public actionProposals;
    mapping(bytes32 => uint256) public poolProposals;
    mapping(bytes32 => uint256) public proposedRoles;
}
```

## 🔐 Role-Based Access Control

### Role Hierarchy

```
OWNER_ROLE (Root)
├── ROLE_MANAGER_ROLE (Admin of all operational roles)
│   ├── ACTION_PROPOSER_ROLE → ACTION_EXECUTOR_ROLE → ACTION_DISPOSER_ROLE
│   ├── ACTION_CANCELER_ROLE
│   ├── POOL_PROPOSER_ROLE → POOL_EXECUTOR_ROLE → POOL_DISPOSER_ROLE
│   ├── POOL_CANCELER_ROLE
│   ├── FEE_PROPOSER_ROLE → FEE_EXECUTOR_ROLE
│   ├── FEE_CANCELER_ROLE
│   ├── TRANSACTION_PROPOSER_ROLE → TRANSACTION_EXECUTOR_ROLE → TRANSACTION_DISPOSER_ROLE
│   └── TRANSACTION_CANCELER_ROLE
└── FEE_TAKER_ROLE (Special permission for fee collection)
```

### Role Definitions

#### Core Administrative Roles

**OWNER_ROLE** (`0x00`)

- Ultimate authority over the system
- Can grant/revoke any role immediately (bypasses delays)
- Can override time delays in emergency situations
- Self-administered (OWNER_ROLE is admin of OWNER_ROLE)

**ROLE_MANAGER_ROLE** (`keccak256("ROLE_MANAGER_ROLE")`)

- Manages all operational roles through proposal system
- Cannot grant OWNER_ROLE (security restriction)
- Must follow time-delayed proposal process
- Admin of all operational roles

#### Action Management Roles

**ACTION_PROPOSER_ROLE** (`keccak256("ACTION_PROPOSER_ROLE")`)

- Can propose new action contracts for inclusion
- Validates action contracts before proposal
- Creates time-delayed proposals in registry

**ACTION_CANCELER_ROLE** (`keccak256("ACTION_CANCELER_ROLE")`)

- Can cancel pending action proposals
- Useful for stopping malicious or incorrect proposals
- No time delay required

**ACTION_EXECUTOR_ROLE** (`keccak256("ACTION_EXECUTOR_ROLE")`)

- Can execute action proposals after delay period
- Validates that proposals have passed required waiting time
- Adds actions to the live registry

**ACTION_DISPOSER_ROLE** (`keccak256("ACTION_DISPOSER_ROLE")`)

- Can remove actions from the registry immediately
- Used for emergency removal of compromised actions
- No time delay or proposal required

#### Pool Management Roles

**POOL_PROPOSER_ROLE** (`keccak256("POOL_PROPOSER_ROLE")`)

- Can propose new protocol pools for whitelisting
- Validates pool contracts and protocol information
- Creates time-delayed proposals for pool inclusion

**POOL_CANCELER_ROLE** (`keccak256("POOL_CANCELER_ROLE")`)

- Can cancel pending pool proposals
- No time delay required

**POOL_EXECUTOR_ROLE** (`keccak256("POOL_EXECUTOR_ROLE")`)

- Can execute pool proposals after delay period
- Adds pools to the whitelist for use by actions

**POOL_DISPOSER_ROLE** (`keccak256("POOL_DISPOSER_ROLE")`)

- Can remove pools from whitelist immediately
- Used for emergency pool removal

#### Fee Management Roles

**FEE_PROPOSER_ROLE** (`keccak256("FEE_PROPOSER_ROLE")`)

- Can propose changes to fee configuration
- Includes fee recipient, minimum rate, and maximum rate
- Creates time-delayed proposals

**FEE_CANCELER_ROLE** (`keccak256("FEE_CANCELER_ROLE")`)

- Can cancel pending fee configuration proposals
- No time delay required

**FEE_EXECUTOR_ROLE** (`keccak256("FEE_EXECUTOR_ROLE")`)

- Can execute fee configuration changes after delay
- Updates the active fee configuration

**FEE_TAKER_ROLE** (`keccak256("FEE_TAKER_ROLE")`)

- Special role for entities authorized to collect fees
- Can call fee-related functions in actions
- Managed directly by ROLE_MANAGER_ROLE

#### Transaction Registry Roles

**TRANSACTION_PROPOSER_ROLE** (`keccak256("TRANSACTION_PROPOSER_ROLE")`)

- Can propose transaction hashes for pre-approval
- Used for complex multi-step governance operations
- Creates time-delayed proposals

**TRANSACTION_CANCELER_ROLE** (`keccak256("TRANSACTION_CANCELER_ROLE")`)

- Can cancel pending transaction proposals

**TRANSACTION_EXECUTOR_ROLE** (`keccak256("TRANSACTION_EXECUTOR_ROLE")`)

- Can approve transaction hashes after delay period

**TRANSACTION_DISPOSER_ROLE** (`keccak256("TRANSACTION_DISPOSER_ROLE")`)

- Can revoke approved transaction hashes

## ⏰ Time-Delayed Proposal System

### Proposal Lifecycle

All system changes (except OWNER_ROLE actions) follow this pattern:

1. **Proposal** - Submit change with appropriate PROPOSER role
2. **Delay** - Mandatory waiting period (default: 24 hours)
3. **Execution** - Apply change with EXECUTOR role
4. **Optional Cancellation** - Cancel with CANCELER role (before execution)

### Implementation Pattern

```solidity
// 1. Proposal phase
function proposeAction(bytes4 actionId, address actionAddress) external onlyRole(ACTION_PROPOSER_ROLE) {
    bytes32 proposalId = keccak256(abi.encodePacked(actionId, actionAddress));
    actionProposals[proposalId] = block.timestamp + delay;
    LOGGER.logAdminVaultEvent(101, abi.encode(actionId, actionAddress));
}

// 2. Execution phase (after delay)
function addAction(bytes4 actionId, address actionAddress) external onlyRole(ACTION_EXECUTOR_ROLE) {
    bytes32 proposalId = keccak256(abi.encodePacked(actionId, actionAddress));
    require(block.timestamp >= actionProposals[proposalId], "Delay not passed");

    actionAddresses[actionId] = actionAddress;
    delete actionProposals[proposalId];
    LOGGER.logAdminVaultEvent(201, abi.encode(actionId, actionAddress));
}

// 3. Cancellation (optional)
function cancelActionProposal(bytes4 actionId, address actionAddress) external onlyRole(ACTION_CANCELER_ROLE) {
    bytes32 proposalId = keccak256(abi.encodePacked(actionId, actionAddress));
    delete actionProposals[proposalId];
    LOGGER.logAdminVaultEvent(301, abi.encode(actionId, actionAddress));
}
```

### Delay Configuration

The delay period is configurable but bounded:

```solidity
uint256 public constant MAX_DELAY = 5 days;  // Maximum allowed delay
uint256 public delay;                        // Current delay setting
uint256 public proposedDelay;               // Proposed new delay
uint256 public delayReductionLockTime;      // When new delay becomes active
```

**Delay Management:**

- Delay increases take effect immediately
- Delay reductions require a lock period equal to the current delay
- Prevents rapid delay reduction attacks

### OWNER_ROLE Emergency Powers

The OWNER_ROLE can bypass time delays:

```solidity
function grantRole(bytes32 role, address account) public override {
    if (hasRole(OWNER_ROLE, msg.sender)) {
        // OWNER can grant any role immediately
        super.grantRole(role, account);
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
        return;
    }

    // Others must follow proposal system
    // ... proposal validation logic
}
```

## 📋 Registry Management

### Action Registry

Actions are stored by their 4-byte identifier:

```solidity
mapping(bytes4 => address) public actionAddresses;

function getActionAddress(bytes4 actionId) external view returns (address) {
    address actionAddr = actionAddresses[actionId];
    require(actionAddr != address(0), "Action not found");
    return actionAddr;
}
```

**Action ID Generation:**

```solidity
function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
    return bytes4(keccak256(abi.encodePacked(_addr)));
}
```

**Action Management Flow:**

1. Deploy new action contract
2. Generate action ID from contract address
3. Propose action with ID and address
4. Wait for delay period
5. Execute proposal to add action
6. Action becomes available for sequences

### Pool Registry

Pools are organized by protocol and pool ID:

```solidity
mapping(uint256 => mapping(bytes4 => address)) public protocolPools;
mapping(address => bool) public pool;  // Quick validation lookup

function getPoolAddress(string calldata protocolName, bytes4 poolId) external view returns (address) {
    uint256 protocolId = _protocolIdFromName(protocolName);
    address poolAddr = protocolPools[protocolId][poolId];
    require(poolAddr != address(0), "Pool not found");
    return poolAddr;
}
```

**Protocol ID Generation:**

```solidity
function _protocolIdFromName(string memory name) internal pure returns (uint256) {
    return uint256(keccak256(abi.encodePacked(name)));
}
```

**Pool Management Flow:**

1. Identify protocol pools for integration
2. Generate protocol ID from name and pool ID from address
3. Propose pool with protocol name and address
4. Wait for delay period
5. Execute proposal to whitelist pool
6. Pool becomes available for actions

### Fee Configuration

Fee structure supports percentage-based fees with flexible recipients:

```solidity
struct FeeConfig {
    address recipient;    // Where fees are sent
    uint256 minBasis;    // Minimum fee in basis points
    uint256 maxBasis;    // Maximum fee in basis points
    uint256 proposalTime; // Used for proposals (0 for active config)
}

FeeConfig public feeConfig;        // Active configuration
FeeConfig public pendingFeeConfig; // Proposed configuration
```

**Fee Management Flow:**

1. Propose new fee configuration (recipient, min rate, max rate)
2. Wait for delay period
3. Execute proposal to update active configuration
4. New fees apply to subsequent operations

**Fee Timestamp Management:**

```solidity
mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

function setFeeTimestamp(address _pool) external {
    require(pool[_pool], "Pool not whitelisted");
    lastFeeTimestamp[msg.sender][_pool] = block.timestamp;
}
```

## 🔄 Role Management

### Role Proposal Process

Non-OWNER roles must be granted through proposals:

```solidity
function proposeRole(bytes32 role, address account) external {
    require(hasRole(getRoleAdmin(role), msg.sender), "Must have admin role");
    require(!hasRole(role, account), "Already has role");

    bytes32 proposalId = keccak256(abi.encodePacked(role, account));
    proposedRoles[proposalId] = block.timestamp + delay;
    LOGGER.logAdminVaultEvent(104, abi.encode(role, account));
}

function grantRole(bytes32 role, address account) public override {
    if (hasRole(OWNER_ROLE, msg.sender)) {
        // OWNER bypasses delay
        super.grantRole(role, account);
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
        return;
    }

    // Others follow proposal system
    bytes32 proposalId = keccak256(abi.encodePacked(role, account));
    require(proposedRoles[proposalId] != 0, "Not proposed");
    require(block.timestamp >= proposedRoles[proposalId], "Delay not passed");

    delete proposedRoles[proposalId];
    super.grantRole(role, account);
    LOGGER.logAdminVaultEvent(204, abi.encode(role, account));
}
```

### Role Hierarchy Setup

Initial role configuration establishes the hierarchy:

```solidity
constructor(address _initialOwner, uint256 _delay, address _logger) {
    // Grant initial roles to owner
    _grantRole(OWNER_ROLE, _initialOwner);
    _grantRole(ROLE_MANAGER_ROLE, _initialOwner);

    // Set up role hierarchy
    _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
    _setRoleAdmin(ROLE_MANAGER_ROLE, OWNER_ROLE);
    _setRoleAdmin(FEE_TAKER_ROLE, ROLE_MANAGER_ROLE);

    // All operational roles managed by ROLE_MANAGER_ROLE
    _setRoleAdmin(ACTION_PROPOSER_ROLE, ROLE_MANAGER_ROLE);
    _setRoleAdmin(ACTION_EXECUTOR_ROLE, ROLE_MANAGER_ROLE);
    // ... etc for all roles
}
```

## 📊 Event Logging

All AdminVault operations emit structured events through the Logger:

```solidity
event AdminVaultEvent(uint256 logId, bytes data);
```

### Event ID Schema

Event IDs follow a structured format: `ABC`

- **A**: Operation type (1=Propose, 2=Execute, 3=Cancel, 4=Remove)
- **BC**: Category (01=Action, 02=Pool, 03=Fee, 04=Role, 05=Transaction)

**Examples:**

- `101`: Propose Action
- `201`: Execute Action
- `301`: Cancel Action
- `401`: Remove Action
- `102`: Propose Pool
- `203`: Execute Fee Configuration
- `104`: Propose Role
- `204`: Grant Role

### Event Data Encoding

Events include relevant data encoded as bytes:

```solidity
// Action events
LOGGER.logAdminVaultEvent(101, abi.encode(actionId, actionAddress));

// Pool events
LOGGER.logAdminVaultEvent(102, abi.encode(protocolId, poolAddress));

// Fee events
LOGGER.logAdminVaultEvent(103, abi.encode(recipient, minBasis, maxBasis));

// Role events
LOGGER.logAdminVaultEvent(104, abi.encode(role, account));
```

## 🛡️ Security Features

### Protection Against Common Attacks

#### 1. Time Delay Protection

- Prevents rapid changes that could be used for attacks
- Gives community time to review and respond to proposals
- OWNER_ROLE retains emergency override capability

#### 2. Role Separation

- No single role can complete a malicious action alone
- Proposer ≠ Executor for most operations
- Canceler provides additional oversight

#### 3. Proposal Validation

- Duplicate proposals are rejected
- Role requirements are strictly enforced
- Storage slots are properly cleaned up

#### 4. Pool Validation

- Pool addresses must be whitelisted before use
- Prevents actions from interacting with malicious contracts
- Quick lookup for validation

### Access Control Checks

Every function includes appropriate access control:

```solidity
modifier onlyRole(bytes32 role) {
    require(hasRole(role, msg.sender), "AccessControl: account missing role");
    _;
}
```

### Input Validation

All inputs are validated:

```solidity
function proposeAction(bytes4 actionId, address actionAddress) external onlyRole(ACTION_PROPOSER_ROLE) {
    require(actionAddresses[actionId] == address(0), "Action already exists");
    require(actionAddress != address(0), "Invalid action address");
    require(actionId != bytes4(0), "Invalid action ID");
    // ... rest of function
}
```

## 🔧 Integration Patterns

### For Action Contracts

Actions interact with AdminVault for validation:

```solidity
contract MyAction is ActionBase {
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Get pool address from AdminVault
        address poolAddr = ADMIN_VAULT.getPoolAddress("MyProtocol", poolId);

        // Validate pool is whitelisted
        require(poolAddr != address(0), "Pool not whitelisted");

        // Execute action logic...
    }
}
```

### For Governance Scripts

Deployment scripts can automate proposal workflows:

```typescript
// Deployment script example
async function deployAndProposeAction() {
  // Deploy new action
  const newAction = await ethers.deployContract('MyNewAction', [
    adminVault.address,
  ]);

  // Generate action ID
  const actionId = ethers
    .keccak256(ethers.solidityPacked(['address'], [newAction.address]))
    .slice(0, 10);

  // Propose action
  await adminVault.connect(proposer).proposeAction(actionId, newAction.address);

  console.log(`Proposed action ${actionId} at ${newAction.address}`);
  console.log(`Execute after delay period expires`);
}
```

### For Monitoring Systems

Event monitoring for governance oversight:

```typescript
// Monitor AdminVault events
adminVault.on('AdminVaultEvent', (logId, data, event) => {
  const operation = Math.floor(logId / 100);
  const category = logId % 100;

  if (operation === 1) {
    console.log(`New proposal: Category ${category}`);
    // Alert governance participants
  } else if (operation === 2) {
    console.log(`Proposal executed: Category ${category}`);
    // Update off-chain registries
  }
});
```

## 📈 Best Practices

### For Protocol Operators

1. **Regular Review**: Monitor all proposals during delay periods
2. **Role Distribution**: Distribute roles across multiple trusted parties
3. **Emergency Procedures**: Maintain OWNER_ROLE for emergency response
4. **Documentation**: Keep clear records of all changes and rationale

### For Developers

1. **Validation**: Always validate inputs from AdminVault responses
2. **Error Handling**: Handle cases where pools/actions don't exist
3. **Gas Optimization**: Cache AdminVault responses when possible
4. **Event Monitoring**: Subscribe to relevant AdminVault events

### For Security

1. **Delay Configuration**: Set appropriate delays for system risk level
2. **Role Auditing**: Regularly review role assignments
3. **Proposal Monitoring**: Automated monitoring of all proposals
4. **Access Control**: Principle of least privilege for role assignment

## 🔍 Troubleshooting

### Common Issues

**"Delay not passed" errors:**

- Check proposal timestamp with `getActionProposalTime()` /
  `getPoolProposalTime()`
- Ensure sufficient time has elapsed since proposal
- Verify block timestamp alignment

**"Not proposed" errors:**

- Verify proposal exists in contract state
- Check that proposal wasn't cancelled
- Confirm correct proposal parameters

**Access control errors:**

- Verify account has required role with `hasRole()`
- Check role hierarchy and admin relationships
- Ensure role was properly granted through proposal process

**Pool/Action not found:**

- Confirm items were properly added to registry
- Check spelling of protocol names
- Verify action IDs match deployed contracts

This comprehensive governance system ensures secure, transparent, and controlled
evolution of the Brava protocol while maintaining operational flexibility.
