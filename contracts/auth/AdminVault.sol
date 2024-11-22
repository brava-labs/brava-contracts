// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {Errors} from "../Errors.sol";
import {AccessControlDelayed} from "./AccessControlDelayed.sol";

/// @title AdminVault
/// @notice A stateful contract that manages global variables and permissions for the protocol.
/// @notice Part of the Brava protocol.
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
contract AdminVault is AccessControlDelayed, Multicall {
    /// @notice The maximum fee basis points.
    /// @dev 1000 = 10%
    uint256 public constant MAX_FEE_BASIS = 1000;

    /// @notice Timestamp tracking for fee collection: user => protocolId => pool => timestamp
    ///  Used to store the timestamp of the last fee collection for a given user, protocol and pool combination.
    ///  Is zero if never deposited, or when balance reduced to zero.
    /// @dev Certain protocols (e.g. Aave) have a singular pool, so instead we use the underlying asset address in place of the pool address.
    /// @dev If a protocol was found that has non-unique pool and underlying asset addresses, a new unique value should be created for 'pool'.
    mapping(address => mapping(uint256 => mapping(address => uint256))) public lastFeeTimestamp;

    /// @notice Protocol and pool management: protocol => poolId => poolAddress
    ///  Action contracts are only given the poolId, so this mapping limits them to pool addresses we've approved.
    mapping(uint256 => mapping(bytes4 => address)) public protocolPools;

    /// @notice Quick check for pool addresses, limits attack surface when writing timestamps to storage
    /// @dev Don't remove pools from this mapping, for non-unique pools this is the underlying asset address.
    /// @dev So removing them could break other protocols. (e.g. Aave V2 and V3 have the same 'pool' address for USDC)
    mapping(address => bool) public pool;

    /// @notice Proposal tracking: proposalId => timestamp
    mapping(bytes32 => uint256) public poolProposals;
    mapping(bytes32 => uint256) public actionProposals;

    /// @notice Fee configuration structure
    struct FeeConfig {
        address recipient;
        uint256 minBasis;
        uint256 maxBasis;
        uint256 proposalTime; // Used only for proposals, 0 for active config
    }
    /// @notice Current active fee configuration
    FeeConfig public feeConfig;
    /// @notice Pending fee configuration proposal
    FeeConfig public pendingFeeConfig;

    /// @notice Action management: actionId => actionAddress
    /// The sequence executor is only given the actionId, so this mapping limits it to action addresses we've approved.
    mapping(bytes4 => address) public actionAddresses;

    /// @notice Initializes the AdminVault with an initial owner, delay period and logger.
    /// @param _initialOwner The address to be granted all initial
    /// @param _delay The required delay period for proposals (in seconds).
    /// @param _logger The address of the Logger contract.
    constructor(address _initialOwner, uint256 _delay, address _logger) AccessControlDelayed(_delay, _logger) {
        require(_initialOwner != address(0) && _logger != address(0), Errors.InvalidInput("AdminVault", "constructor"));

        // Set initial fee configuration
        feeConfig = FeeConfig({recipient: _initialOwner, minBasis: 0, maxBasis: MAX_FEE_BASIS, proposalTime: 0});

        _grantRole(OWNER_ROLE, _initialOwner);
        _grantRole(ADMIN_ROLE, _initialOwner);

        // Grant all granular roles to initial owner
        _grantRole(ROLE_PROPOSER_ROLE, _initialOwner);
        _grantRole(ROLE_CANCELER_ROLE, _initialOwner);
        _grantRole(ROLE_EXECUTOR_ROLE, _initialOwner);
        _grantRole(ROLE_DISPOSER_ROLE, _initialOwner);
        _grantRole(FEE_PROPOSER_ROLE, _initialOwner);
        _grantRole(FEE_CANCELER_ROLE, _initialOwner);
        _grantRole(FEE_EXECUTOR_ROLE, _initialOwner);
        _grantRole(POOL_PROPOSER_ROLE, _initialOwner);
        _grantRole(POOL_CANCELER_ROLE, _initialOwner);
        _grantRole(POOL_EXECUTOR_ROLE, _initialOwner);
        _grantRole(POOL_DISPOSER_ROLE, _initialOwner);
        _grantRole(ACTION_PROPOSER_ROLE, _initialOwner);
        _grantRole(ACTION_CANCELER_ROLE, _initialOwner);
        _grantRole(ACTION_EXECUTOR_ROLE, _initialOwner);
        _grantRole(ACTION_DISPOSER_ROLE, _initialOwner);
        _grantRole(FEE_TAKER_ROLE, _initialOwner);

        // Set role hierarchy
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
        _setRoleAdmin(ADMIN_ROLE, OWNER_ROLE);
        _setRoleAdmin(FEE_TAKER_ROLE, OWNER_ROLE);

        // Proposer roles managed by OWNER
        _setRoleAdmin(FEE_PROPOSER_ROLE, OWNER_ROLE);
        _setRoleAdmin(POOL_PROPOSER_ROLE, OWNER_ROLE);
        _setRoleAdmin(ACTION_PROPOSER_ROLE, OWNER_ROLE);

        // Canceler roles managed by ADMIN
        _setRoleAdmin(FEE_CANCELER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(POOL_CANCELER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ACTION_CANCELER_ROLE, ADMIN_ROLE);

        // Executor roles managed by ADMIN
        _setRoleAdmin(FEE_EXECUTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(POOL_EXECUTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ACTION_EXECUTOR_ROLE, ADMIN_ROLE);

        // Disposer roles managed by ADMIN
        _setRoleAdmin(POOL_DISPOSER_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ACTION_DISPOSER_ROLE, ADMIN_ROLE);
    }

    /// Fee management
    ///  - Propose
    ///  - Cancel
    ///  - Set

    /// @notice Proposes a new fee configuration including recipient and fee range
    /// @param _recipient The address of the proposed fee recipient
    /// @param _min The minimum fee in basis points
    /// @param _max The maximum fee in basis points
    function proposeFeeConfig(address _recipient, uint256 _min, uint256 _max) external onlyRole(FEE_PROPOSER_ROLE) {
        require(_recipient != address(0), Errors.InvalidInput("AdminVault", "proposeFeeConfig"));
        require(_max <= MAX_FEE_BASIS, Errors.AdminVault_FeePercentageOutOfRange(_max, 0, MAX_FEE_BASIS));
        require(_min <= _max, Errors.AdminVault_InvalidFeeRange(_min, _max));

        pendingFeeConfig = FeeConfig({
            recipient: _recipient,
            minBasis: _min,
            maxBasis: _max,
            proposalTime: _getDelayTimestamp()
        });

        LOGGER.logAdminVaultEvent(103, abi.encode(_recipient, _min, _max));
    }

    /// @notice Cancels the pending fee configuration proposal
    function cancelFeeConfigProposal() external onlyRole(FEE_CANCELER_ROLE) {
        LOGGER.logAdminVaultEvent(
            303,
            abi.encode(pendingFeeConfig.recipient, pendingFeeConfig.minBasis, pendingFeeConfig.maxBasis)
        );
        delete pendingFeeConfig;
    }

    /// @notice Sets the pending fee configuration after the proposal delay has passed
    function setFeeConfig() external onlyRole(FEE_EXECUTOR_ROLE) {
        require(pendingFeeConfig.proposalTime != 0, Errors.AdminVault_NotProposed());
        require(
            block.timestamp >= pendingFeeConfig.proposalTime,
            Errors.AdminVault_DelayNotPassed(block.timestamp, pendingFeeConfig.proposalTime)
        );

        LOGGER.logAdminVaultEvent(
            203,
            abi.encode(pendingFeeConfig.recipient, pendingFeeConfig.minBasis, pendingFeeConfig.maxBasis)
        );

        // Update active config (note: proposalTime remains 0 for active config)
        pendingFeeConfig.proposalTime = 0;
        feeConfig = pendingFeeConfig;
        delete pendingFeeConfig;
    }

    /// Pool management
    ///  - Propose
    ///  - Cancel
    ///  - Add
    ///  - Remove

    /// @notice Proposes a new pool for a protocol.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool.
    function proposePool(string calldata _protocolName, address _poolAddress) external onlyRole(POOL_PROPOSER_ROLE) {
        require(
            _poolAddress != address(0) && bytes(_protocolName).length != 0,
            Errors.InvalidInput("AdminVault", "proposePool")
        );
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = _protocolIdFromName(_protocolName);
        require(protocolPools[protocolId][poolId] == address(0), Errors.AdminVault_AlreadyAdded());

        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        poolProposals[proposalId] = _getDelayTimestamp();

        LOGGER.logAdminVaultEvent(102, abi.encode(protocolId, _poolAddress));
    }

    /// @notice Cancels a pool proposal.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the proposed pool.
    function cancelPoolProposal(
        string calldata _protocolName,
        address _poolAddress
    ) external onlyRole(POOL_CANCELER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = _protocolIdFromName(_protocolName);
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        require(poolProposals[proposalId] != 0, Errors.AdminVault_NotProposed());

        poolProposals[proposalId] = 0;

        LOGGER.logAdminVaultEvent(302, abi.encode(protocolId, _poolAddress));
    }

    /// @notice Adds a new pool after the proposal delay has passed.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool to add.
    function addPool(string calldata _protocolName, address _poolAddress) external onlyRole(POOL_EXECUTOR_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = _protocolIdFromName(_protocolName);
        require(protocolPools[protocolId][poolId] == address(0), Errors.AdminVault_AlreadyAdded());
        require(
            bytes(_protocolName).length != 0 && _poolAddress != address(0),
            Errors.InvalidInput("AdminVault", "addPool")
        );

        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        require(poolProposals[proposalId] != 0, Errors.AdminVault_NotProposed());
        require(
            block.timestamp >= poolProposals[proposalId],
            Errors.AdminVault_DelayNotPassed(block.timestamp, poolProposals[proposalId])
        );

        protocolPools[protocolId][poolId] = _poolAddress;
        pool[_poolAddress] = true;
        LOGGER.logAdminVaultEvent(202, abi.encode(protocolId, _poolAddress));
    }

    function removePool(string calldata _protocolName, address _poolAddress) external onlyRole(POOL_DISPOSER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = _protocolIdFromName(_protocolName);
        delete protocolPools[protocolId][poolId];
        LOGGER.logAdminVaultEvent(402, abi.encode(protocolId, _poolAddress));
    }

    /// Action management
    ///  - Propose
    ///  - Cancel
    ///  - Add
    ///  - Remove

    /// @notice Proposes a new action.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract.
    function proposeAction(bytes4 _actionId, address _actionAddress) external onlyRole(ACTION_PROPOSER_ROLE) {
        require(actionAddresses[_actionId] == address(0), Errors.AdminVault_AlreadyAdded());
        require(
            _actionAddress != address(0) && _actionId != bytes4(0),
            Errors.InvalidInput("AdminVault", "proposeAction")
        );

        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(101, abi.encode(_actionId, _actionAddress));
    }

    /// @notice Cancels an action proposal.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the proposed action contract.
    function cancelActionProposal(bytes4 _actionId, address _actionAddress) external onlyRole(ACTION_CANCELER_ROLE) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = 0;
        LOGGER.logAdminVaultEvent(301, abi.encode(_actionId, _actionAddress));
    }

    /// @notice Adds a new action after the proposal delay has passed.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract to add.
    function addAction(bytes4 _actionId, address _actionAddress) external onlyRole(ACTION_EXECUTOR_ROLE) {
        require(actionAddresses[_actionId] == address(0), Errors.AdminVault_AlreadyAdded());
        require(_actionAddress != address(0) && _actionId != bytes4(0), Errors.InvalidInput("AdminVault", "addAction"));

        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        require(actionProposals[proposalId] != 0, Errors.AdminVault_NotProposed());
        require(
            block.timestamp >= actionProposals[proposalId],
            Errors.AdminVault_DelayNotPassed(block.timestamp, actionProposals[proposalId])
        );

        actionAddresses[_actionId] = _actionAddress;
        LOGGER.logAdminVaultEvent(201, abi.encode(_actionId, _actionAddress));
    }

    function removeAction(bytes4 _actionId) external onlyRole(ACTION_DISPOSER_ROLE) {
        delete actionAddresses[_actionId];
        LOGGER.logAdminVaultEvent(401, abi.encode(_actionId));
    }

    /// @notice Initializes the fee timestamp for a pool.
    /// @dev This must only be called when the user has a zero balance.
    /// @param _protocolName The name of the protocol.
    /// @param _pool The address of the pool.
    function setFeeTimestamp(string calldata _protocolName, address _pool) external {
        _isPool(_pool);
        uint256 protocolId = _protocolIdFromName(_protocolName);
        lastFeeTimestamp[msg.sender][protocolId][_pool] = block.timestamp;
    }

    /// @notice Checks if a given address is a pool.
    /// @dev This should always be used when initializing or updating fee timestamps
    /// @dev Without this check an attacker could call one of those functions with a pool address of their choice
    /// @dev this would give them access to the storage slot of their choice. It's only a timestamp they could put there, but still not good.
    /// @param _pool The address to check.
    function _isPool(address _pool) internal view {
        require(pool[_pool], Errors.AdminVault_NotPool(_pool));
    }

    /// @notice Retrieves the address of a pool for a given protocol and pool ID.
    /// @param _protocolName The name of the protocol.
    /// @param _poolId The identifier of the pool.
    /// @return The address of the pool.
    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address) {
        uint256 protocolId = _protocolIdFromName(_protocolName);
        address poolAddress = protocolPools[protocolId][_poolId];
        require(poolAddress != address(0), Errors.AdminVault_NotFound(_protocolName, _poolId));
        return poolAddress;
    }

    /// @notice Retrieves the address of an action for a given action ID.
    /// @param _actionId The identifier of the action.
    /// @return The address of the action contract.
    function getActionAddress(bytes4 _actionId) external view returns (address) {
        address actionAddress = actionAddresses[_actionId];
        require(actionAddress != address(0), Errors.AdminVault_NotFound("action", _actionId));
        return actionAddress;
    }

    /// @notice Retrieves the last fee timestamp for a given pool.
    /// @param _protocolName The name of the protocol.
    /// @param _pool The address of the pool.
    /// @return The last fee timestamp.
    function getLastFeeTimestamp(string calldata _protocolName, address _pool) external view returns (uint256) {
        uint256 protocolId = _protocolIdFromName(_protocolName);
        require(lastFeeTimestamp[msg.sender][protocolId][_pool] != 0, Errors.AdminVault_NotInitialized());

        return lastFeeTimestamp[msg.sender][protocolId][_pool];
    }

    /// @notice Checks if a given fee basis is within the allowed range.
    /// @notice Used by action contracts to ensure they are taking fees within the allowed range.
    /// @param _feeBasis The fee basis to check.
    function checkFeeBasis(uint256 _feeBasis) external view {
        require(
            _feeBasis >= feeConfig.minBasis && _feeBasis <= feeConfig.maxBasis,
            Errors.AdminVault_FeePercentageOutOfRange(_feeBasis, feeConfig.minBasis, feeConfig.maxBasis)
        );
    }

    /// @notice Retrieves the proposal time for a given pool.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool.
    /// @return The proposal timestamp.
    function getPoolProposalTime(string calldata _protocolName, address _poolAddress) external view returns (uint256) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        return poolProposals[proposalId];
    }

    /// @notice Retrieves the proposal time for a given action.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract.
    /// @return The proposal timestamp.
    function getActionProposalTime(bytes4 _actionId, address _actionAddress) external view returns (uint256) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        return actionProposals[proposalId];
    }

    /// @notice Generates a pool ID from an address.
    /// @param _addr The address to generate the pool ID from.
    /// @return bytes4 The pool ID
    function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_addr)));
    }

    /// @notice Generates a protocolID from a protocol name
    /// @param _protocolName The name of the protocol
    /// @return uint256 The protocol ID
    function _protocolIdFromName(string calldata _protocolName) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(_protocolName)));
    }
}
