// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {AccessControlDelayed} from "./AccessControlDelayed.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {Errors} from "../Errors.sol";

/// @title AdminVault
/// @notice A stateful contract that manages global variables and permissions for the protocol.
/// @dev This contract handles fee management, pool and action registrations, and role-based access control.
contract AdminVault is AccessControlDelayed {
    ILogger public immutable LOGGER;

    // Role definitions
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Timestamp tracking for fee collection: user => vault => timestamp
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // TODO improve mapping ID
    // Protocol and pool management: protocol => poolId => poolAddress
    mapping(uint256 => mapping(bytes4 => address)) public protocolPools;

    // Proposal tracking: proposalId => timestamp
    mapping(bytes32 => uint256) public poolProposals;
    mapping(bytes32 => uint256) public actionProposals;
    // Fee configuration structure
    struct FeeConfig {
        address recipient;
        uint256 minBasis;
        uint256 maxBasis;
        uint256 proposalTime; // Used only for proposals, 0 for active config
    }
    // Current active fee configuration
    FeeConfig public feeConfig;
    // Pending fee configuration proposal
    FeeConfig public pendingFeeConfig;

    // Action management: actionId => actionAddress
    mapping(bytes4 => address) public actionAddresses;

    /// @notice Initializes the AdminVault with an initial owner and delay period.
    /// @param _initialOwner The address to be granted all initial roles.
    /// @param _delay The required delay period for proposals (in seconds).
    /// @param _logger The address of the Logger contract.
    constructor(address _initialOwner, uint256 _delay, address _logger) AccessControlDelayed(_delay) {
        if (_initialOwner == address(0) || _logger == address(0)) {
            revert Errors.InvalidInput("AdminVault", "constructor");
        }

        LOGGER = ILogger(_logger);

        // Set initial fee configuration
        feeConfig = FeeConfig({
            recipient: _initialOwner,
            minBasis: 0,
            maxBasis: 1000, // 10% in basis points
            proposalTime: 0
        });

        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(OWNER_ROLE, _initialOwner);
        _grantRole(ADMIN_ROLE, _initialOwner);

        // Set the role hierarchy
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE); // Owner is admin of owner role
        _setRoleAdmin(ADMIN_ROLE, OWNER_ROLE); // Owner is admin of admin role
    }

    /// Fee management
    ///  - Propose
    ///  - Cancel
    ///  - Set

    /// @notice Proposes a new fee configuration including recipient and fee range
    /// @param _recipient The address of the proposed fee recipient
    /// @param _min The minimum fee in basis points
    /// @param _max The maximum fee in basis points
    function proposeFeeConfig(address _recipient, uint256 _min, uint256 _max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert Errors.InvalidInput("AdminVault", "proposeFeeConfig");
        }
        if (_max > 1000) {
            // 10% max
            revert Errors.AdminVault_FeePercentageOutOfRange(_max, 0, 1000);
        }
        if (_min >= _max) {
            revert Errors.AdminVault_InvalidFeeRange(_min, _max);
        }

        pendingFeeConfig = FeeConfig({
            recipient: _recipient,
            minBasis: _min,
            maxBasis: _max,
            proposalTime: _getDelayTimestamp()
        });

        LOGGER.logAdminVaultEvent(103, abi.encode(_recipient, _min, _max));
    }

    /// @notice Cancels the pending fee configuration proposal
    function cancelFeeConfigProposal() external onlyRole(DEFAULT_ADMIN_ROLE) {
        address recipient = pendingFeeConfig.recipient;
        uint256 min = pendingFeeConfig.minBasis;
        uint256 max = pendingFeeConfig.maxBasis;

        delete pendingFeeConfig;

        LOGGER.logAdminVaultEvent(303, abi.encode(recipient, min, max));
    }

    /// @notice Sets the pending fee configuration after the proposal delay has passed
    function setFeeConfig() external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (pendingFeeConfig.proposalTime == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < pendingFeeConfig.proposalTime) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, pendingFeeConfig.proposalTime);
        }

        // Store values for event logging
        address recipient = pendingFeeConfig.recipient;
        uint256 min = pendingFeeConfig.minBasis;
        uint256 max = pendingFeeConfig.maxBasis;

        // Update active config (note: proposalTime remains 0 for active config)
        feeConfig = FeeConfig({recipient: recipient, minBasis: min, maxBasis: max, proposalTime: 0});

        delete pendingFeeConfig;

        LOGGER.logAdminVaultEvent(203, abi.encode(recipient, min, max));
    }

    /// Pool management
    ///  - Propose
    ///  - Cancel
    ///  - Add
    ///  - Remove

    /// @notice Proposes a new pool for a protocol.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool.
    function proposePool(string calldata _protocolName, address _poolAddress) external onlyRole(OWNER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        if (protocolPools[protocolId][poolId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        poolProposals[proposalId] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(102, abi.encode(protocolId, _poolAddress));
    }

    /// @notice Cancels a pool proposal.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the proposed pool.
    function cancelPoolProposal(string calldata _protocolName, address _poolAddress) external onlyRole(OWNER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        if (poolProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        poolProposals[proposalId] = 0;
        LOGGER.logAdminVaultEvent(302, abi.encode(protocolId, _poolAddress));
    }

    /// @notice Adds a new pool after the proposal delay has passed.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool to add.
    function addPool(string calldata _protocolName, address _poolAddress) external onlyRole(ADMIN_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        if (protocolPools[protocolId][poolId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        if (bytes(_protocolName).length == 0 || _poolAddress == address(0)) {
            revert Errors.InvalidInput("AdminVault", "addPool");
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        if (poolProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < poolProposals[proposalId]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, poolProposals[proposalId]);
        }
        protocolPools[protocolId][poolId] = _poolAddress;
        LOGGER.logAdminVaultEvent(202, abi.encode(protocolId, _poolAddress));
    }

    function removePool(string calldata _protocolName, address _poolAddress) external onlyRole(ADMIN_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
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
    function proposeAction(bytes4 _actionId, address _actionAddress) external onlyRole(OWNER_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        if (_actionAddress == address(0) || _actionId == bytes4(0)) {
            revert Errors.InvalidInput("AdminVault", "proposeAction");
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(101, abi.encode(_actionId, _actionAddress));
    }

    /// @notice Cancels an action proposal.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the proposed action contract.
    function cancelActionProposal(bytes4 _actionId, address _actionAddress) external onlyRole(OWNER_ROLE) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = 0;
        LOGGER.logAdminVaultEvent(301, abi.encode(_actionId, _actionAddress));
    }

    /// @notice Adds a new action after the proposal delay has passed.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract to add.
    function addAction(bytes4 _actionId, address _actionAddress) external onlyRole(ADMIN_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        if (actionProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < actionProposals[proposalId]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, actionProposals[proposalId]);
        }
        actionAddresses[_actionId] = _actionAddress;
        LOGGER.logAdminVaultEvent(201, abi.encode(_actionId, _actionAddress));
    }

    function removeAction(bytes4 _actionId) external onlyRole(ADMIN_ROLE) {
        delete actionAddresses[_actionId];
        LOGGER.logAdminVaultEvent(401, abi.encode(_actionId));
    }

    /// Fee timestamp management
    ///  - Initialize
    ///  - Update

    /// @notice Initializes the fee timestamp for a vault.
    /// @dev This should be called when a user's deposit changes from zero to non-zero.
    /// @param _vault The address of the vault.
    /// @dev TODO: Add a guard to block attackers from calling this, given access to a mapping they can write to storage of their choice
    function initializeFeeTimestamp(address _vault) external {
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    /// @notice Updates the fee timestamp for a vault.
    /// @dev This should be called when a fee is taken.
    /// @param _vault The address of the vault.
    function updateFeeTimestamp(address _vault) external {
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    /// Getters

    /// @notice Retrieves the address of a pool for a given protocol and pool ID.
    /// @param _protocolName The name of the protocol.
    /// @param _poolId The identifier of the pool.
    /// @return The address of the pool.
    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address) {
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        address poolAddress = protocolPools[protocolId][_poolId];
        if (poolAddress == address(0)) {
            revert Errors.AdminVault_NotFound(_protocolName, _poolId);
        }
        return poolAddress;
    }

    /// @notice Retrieves the address of an action for a given action ID.
    /// @param _actionId The identifier of the action.
    /// @return The address of the action contract.
    function getActionAddress(bytes4 _actionId) external view returns (address) {
        address actionAddress = actionAddresses[_actionId];
        if (actionAddress == address(0)) {
            revert Errors.AdminVault_NotFound("action", _actionId);
        }
        return actionAddress;
    }

    /// @notice Retrieves the last fee timestamp for a given vault.
    /// @param _vault The address of the vault.
    /// @return The last fee timestamp.
    function getLastFeeTimestamp(address _vault) external view returns (uint256) {
        if (lastFeeTimestamp[msg.sender][_vault] == 0) {
            revert Errors.AdminVault_NotInitialized();
        }
        return lastFeeTimestamp[msg.sender][_vault];
    }

    /// @notice Checks if a given fee basis is within the allowed range.
    /// @param _feeBasis The fee basis to check.
    function checkFeeBasis(uint256 _feeBasis) external view {
        if (_feeBasis < feeConfig.minBasis || _feeBasis > feeConfig.maxBasis) {
            revert Errors.AdminVault_FeePercentageOutOfRange(_feeBasis, feeConfig.minBasis, feeConfig.maxBasis);
        }
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

    /// Helper functions

    /// @notice Generates a pool ID from an address.
    /// @param _addr The address to generate the pool ID from.
    /// @return The pool ID as bytes4.
    function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_addr)));
    }
}
