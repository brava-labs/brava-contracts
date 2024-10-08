// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {AccessControlDelayed} from "./AccessControlDelayed.sol";
import {Errors} from "../Errors.sol";

/// @title AdminVault
/// @notice A stateful contract that manages global variables and permissions for the protocol.
/// @dev This contract handles fee management, pool and action registrations, and role-based access control.
contract AdminVault is AccessControlDelayed {
    // Role definitions
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Fee configuration
    uint256 public minFeeBasis;
    uint256 public maxFeeBasis;
    address public feeRecipient;

    // Timestamp tracking for fee collection: user => vault => timestamp
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // Protocol and pool management: protocol => poolId => poolAddress
    mapping(string => mapping(bytes4 => address)) public protocolPools;

    // Proposal tracking: proposalId => timestamp
    mapping(bytes32 => uint256) public poolProposals;
    mapping(bytes32 => uint256) public actionProposals;
    mapping(address => uint256) public feeRecipientProposal;

    // Action management: actionId => actionAddress
    mapping(bytes4 => address) public actionAddresses;

    // Events
    event FeeRangeSet(uint256 minFee, uint256 maxFee);
    event FeeRecipientProposed(address indexed proposer, address indexed proposedRecipient, uint256 timestamp);
    event FeeRecipientSet(address indexed newFeeRecipient);
    event PoolProposed(
        string indexed protocolName,
        bytes4 indexed poolId,
        address indexed poolAddress,
        uint256 timestamp
    );
    event PoolAdded(string indexed protocolName, bytes4 indexed poolId, address indexed poolAddress);
    event ActionProposed(bytes4 indexed actionId, address indexed actionAddress, uint256 timestamp);
    event ActionAdded(bytes4 indexed actionId, address indexed actionAddress);

    /// @notice Initializes the AdminVault with an initial owner and delay period.
    /// @param _initialOwner The address to be granted all initial roles.
    /// @param _delay The required delay period for proposals (in seconds).
    constructor(address _initialOwner, uint256 _delay) AccessControlDelayed(_delay) {
        if (_initialOwner == address(0)) {
            revert Errors.InvalidInput("AdminVault", "constructor");
        }

        // Set initial fee configuration
        minFeeBasis = 0;
        maxFeeBasis = 10000; // 100% in basis points
        feeRecipient = _initialOwner;

        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(OWNER_ROLE, _initialOwner);
        _grantRole(ADMIN_ROLE, _initialOwner);

        // Set the role hierarchy
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE); // Owner is admin of owner role
        _setRoleAdmin(ADMIN_ROLE, OWNER_ROLE); // Owner is admin of admin role
    }

    /// @notice Sets the allowable fee range.
    /// @param _min The minimum fee in basis points.
    /// @param _max The maximum fee in basis points.
    function setFeeRange(uint256 _min, uint256 _max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_min >= _max) {
            revert Errors.AdminVault_InvalidFeeRange(_min, _max);
        }
        minFeeBasis = _min;
        maxFeeBasis = _max;
        emit FeeRangeSet(_min, _max);
    }

    /// Fee recipient management
    ///  - Propose
    ///  - Cancel
    ///  - Set

    /// @notice Proposes a new fee recipient.
    /// @param _recipient The address of the proposed fee recipient.
    function proposeFeeRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert Errors.InvalidInput("AdminVault", "proposeFeeRecipient");
        }
        feeRecipientProposal[_recipient] = block.timestamp + delay;
        emit FeeRecipientProposed(msg.sender, _recipient, feeRecipientProposal[_recipient]);
    }

    /// @notice Cancels a fee recipient proposal.
    /// @param _recipient The address of the proposed fee recipient to cancel.
    function cancelFeeRecipientProposal(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeRecipientProposal[_recipient] = 0;
    }

    /// @notice Sets a new fee recipient after the proposal delay has passed.
    /// @param _recipient The address to set as the new fee recipient.
    function setFeeRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert Errors.InvalidInput("AdminVault", "setFeeRecipient");
        }
        if (feeRecipientProposal[_recipient] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < feeRecipientProposal[_recipient]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, feeRecipientProposal[_recipient]);
        }
        feeRecipientProposal[_recipient] = 0;
        feeRecipient = _recipient;
        emit FeeRecipientSet(_recipient);
    }

    /// Pool management
    ///  - Propose
    ///  - Cancel
    ///  - Add

    /// @notice Proposes a new pool for a protocol.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool.
    function proposePool(string calldata _protocolName, address _poolAddress) external onlyRole(OWNER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        if (protocolPools[_protocolName][poolId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        poolProposals[proposalId] = block.timestamp + delay;
        emit PoolProposed(_protocolName, poolId, _poolAddress, poolProposals[proposalId]);
    }

    /// @notice Cancels a pool proposal.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the proposed pool.
    function cancelPoolProposal(string calldata _protocolName, address _poolAddress) external onlyRole(OWNER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        if (poolProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        poolProposals[proposalId] = 0;
    }

    /// @notice Adds a new pool after the proposal delay has passed.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool to add.
    function addPool(string calldata _protocolName, address _poolAddress) external onlyRole(ADMIN_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        if (protocolPools[_protocolName][poolId] != address(0)) {
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
        protocolPools[_protocolName][poolId] = _poolAddress;
        emit PoolAdded(_protocolName, poolId, _poolAddress);
    }

    /// Action management
    ///  - Propose
    ///  - Cancel
    ///  - Add

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
        actionProposals[proposalId] = block.timestamp + delay;
        emit ActionProposed(_actionId, _actionAddress, actionProposals[proposalId]);
    }

    /// @notice Cancels an action proposal.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the proposed action contract.
    function cancelActionProposal(bytes4 _actionId, address _actionAddress) external onlyRole(OWNER_ROLE) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = 0;
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
        emit ActionAdded(_actionId, _actionAddress);
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
        address poolAddress = protocolPools[_protocolName][_poolId];
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
        if (_feeBasis < minFeeBasis || _feeBasis > maxFeeBasis) {
            revert Errors.AdminVault_FeePercentageOutOfRange(_feeBasis, minFeeBasis, maxFeeBasis);
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
