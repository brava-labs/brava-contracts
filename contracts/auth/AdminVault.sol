// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {AccessControlDelayed} from "./AccessControlDelayed.sol";

/// @title A stateful contract that holds some global variables, and permission management.
contract AdminVault is AccessControlDelayed {
    error FeePercentageOutOfRange();
    error InvalidRecipient();
    error PoolNotAllowed();
    error PoolNotFound();
    error PoolAlreadyAdded();
    error ProtocolNotAllowed();
    error ProtocolHasPools();
    error ProtocolAlreadyAdded();
    error ProtocolNotFound();
    error DepositDisabled();
    error InvalidPoolData();
    error InvalidPoolAddress();
    error ActionAlreadyAdded();
    error ActionNotFound();
    error PoolNotProposed();
    error ActionNotProposed();
    error FeeRecipientNotProposed();
    error InvalidFeeRange();
    error InvalidInput();
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public minFeeBasis;
    uint256 public maxFeeBasis;
    address public feeRecipient;
    // mapping of when a particular safe had fees taken from a particular vault
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // mapping of protocols to their pools, this restricts actions to pools only in their protocol
    // but doesn't restrict us from adding a pool to multiple protocols if necessary
    mapping(string => mapping(bytes4 => address)) public protocolPools; // Protocol => poolId => pool address

    // mapping of proposalId to the timestamp when it was proposed
    mapping(bytes32 => uint256) public poolProposals;
    mapping(bytes32 => uint256) public actionProposals;
    mapping(address => uint256) public feeRecipientProposal;

    // mapping of actionId to action address
    mapping(bytes4 => address) public actionAddresses;

    // Security Layout
    // 1. DEFAULT_ADMIN_ROLE will be disposed of (if granted at all outside testing)
    // 2. OWNER_ROLE can propose new pools and actions
    // 3. ADMIN_ROLE can add new pools and actions subject to proposal delay

    /// TODO: Should we add events for all the setters?
    constructor(address _initialOwner, uint256 _delay) AccessControlDelayed(_delay) {
        // putting some default values here
        minFeeBasis = 0;
        maxFeeBasis = 10000; // 100%
        feeRecipient = _initialOwner;

        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(OWNER_ROLE, _initialOwner);
        _grantRole(ADMIN_ROLE, _initialOwner);

        // Set the role hierarchy
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE); // Owner is admin of owner role
        _setRoleAdmin(ADMIN_ROLE, OWNER_ROLE); // Owner is admin of admin role
    }

    function setFeeRange(uint256 _min, uint256 _max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_min >= _max) {
            revert InvalidFeeRange();
        }
        minFeeBasis = _min;
        maxFeeBasis = _max;
    }

    function proposeFeeRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert InvalidRecipient();
        }
        feeRecipientProposal[_recipient] = block.timestamp + delay;
    }

    function cancelFeeRecipientProposal(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        feeRecipientProposal[_recipient] = 0;
    }

    function setFeeRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (feeRecipientProposal[_recipient] == 0) {
            revert FeeRecipientNotProposed();
        }
        if (block.timestamp < feeRecipientProposal[_recipient]) {
            revert DelayNotPassed();
        }
        feeRecipientProposal[_recipient] = 0;
        feeRecipient = _recipient;
    }

    // called by an action when a user changes their deposit from zero to non-zero
    // TODO: Add a guard to block attackers from calling this, given access to a mapping they can write to storage of their choice
    function initializeFeeTimestamp(address _vault) external {
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    // called by the safe when a fee is taken
    function updateFeeTimestamp(address _vault) external {
        assert(lastFeeTimestamp[msg.sender][_vault] != 0);
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    function proposePool(
        string calldata _protocolName,
        bytes4 _poolId,
        address _poolAddress
    ) external onlyRole(OWNER_ROLE) {
        if (protocolPools[_protocolName][_poolId] != address(0)) {
            revert PoolAlreadyAdded();
        }
        // add the proposal to a waiting list using a hash of the data
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, _poolId, _poolAddress));
        poolProposals[proposalId] = block.timestamp + delay;
    }

    function cancelPoolProposal(
        string calldata _protocolName,
        bytes4 _poolId,
        address _poolAddress
    ) external onlyRole(OWNER_ROLE) {
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, _poolId, _poolAddress));
        poolProposals[proposalId] = 0;
    }

    function addPool(
        string calldata _protocolName,
        bytes4 _poolId,
        address _poolAddress
    ) external onlyRole(ADMIN_ROLE) {
        if (protocolPools[_protocolName][_poolId] != address(0)) {
            revert PoolAlreadyAdded();
        }
        if (bytes(_protocolName).length == 0 || _poolId == bytes4(0) || _poolAddress == address(0)) {
            revert InvalidInput();
        }
        // check if the proposal is in the waiting list
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, _poolId, _poolAddress));
        if (poolProposals[proposalId] == 0) {
            revert PoolNotProposed();
        }
        // check if the delay has passed
        if (block.timestamp < poolProposals[proposalId]) {
            revert DelayNotPassed();
        }
        protocolPools[_protocolName][_poolId] = _poolAddress;
    }

    function proposeAction(bytes4 _actionId, address _actionAddress) external onlyRole(OWNER_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert ActionAlreadyAdded();
        }
        if (_actionAddress == address(0) || _actionId == bytes4(0)) {
            revert InvalidInput();
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = block.timestamp + delay;
    }

    function cancelActionProposal(bytes4 _actionId, address _actionAddress) external onlyRole(OWNER_ROLE) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = 0;
    }

    function addAction(bytes4 _actionId, address _actionAddress) external onlyRole(ADMIN_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert ActionAlreadyAdded();
        }
        // check if the proposal is in the waiting list
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        if (actionProposals[proposalId] == 0) {
            revert ActionNotProposed();
        }
        // check if the delay has passed
        if (block.timestamp < actionProposals[proposalId]) {
            revert DelayNotPassed();
        }
        actionAddresses[_actionId] = _actionAddress;
    }

    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address) {
        address poolAddress = protocolPools[_protocolName][_poolId];
        if (poolAddress == address(0)) {
            revert PoolNotFound();
        }
        return poolAddress;
    }

    function getActionAddress(bytes4 _actionId) external view returns (address) {
        address actionAddress = actionAddresses[_actionId];
        if (actionAddress == address(0)) {
            revert ActionNotFound();
        }
        return actionAddress;
    }

    // View functions
    function getLastFeeTimestamp(address _vault) external view returns (uint256) {
        assert(lastFeeTimestamp[msg.sender][_vault] != 0);
        return lastFeeTimestamp[msg.sender][_vault];
    }

    function checkFeeBasis(uint256 _feeBasis) external view {
        if (_feeBasis < minFeeBasis || _feeBasis > maxFeeBasis) {
            revert FeePercentageOutOfRange();
        }
    }

    function getPoolProposalTime(
        string calldata _protocolName,
        bytes4 _poolId,
        address _poolAddress
    ) external view returns (uint256) {
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, _poolId, _poolAddress));
        return poolProposals[proposalId];
    }

    function getActionProposalTime(bytes4 _actionId, address _actionAddress) external view returns (uint256) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        return actionProposals[proposalId];
    }
}
