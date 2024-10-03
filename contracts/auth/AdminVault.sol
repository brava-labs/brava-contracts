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

    bytes32 public constant ACTION_ADMIN_ROLE = keccak256("ACTION_ADMIN_ROLE");
    bytes32 public constant ACTION_ROLE = keccak256("ACTION_ROLE");
    bytes32 public constant POOL_ROLE = keccak256("POOL_ROLE");

    uint256 public minFeeBasis;
    uint256 public maxFeeBasis;
    address public feeRecipient;
    // mapping of when a particular safe had fees taken from a particular vault
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // mapping of protocols to their pools, this restricts actions to pools only in their protocol
    // but doesn't restrict us from adding a pool to multiple protocols if necessary
    mapping(string => mapping(bytes4 => address)) public protocolPools; // Protocol => poolId => pool address

    // mapping of actionId to action address
    mapping(bytes4 => address) public actionAddresses;

    /// TODO: Should we add events for all the setters?
    constructor(address _initialOwner, uint256 _delay) AccessControlDelayed(_delay) {
        // putting some default values here
        minFeeBasis = 0;
        maxFeeBasis = 10000; // 100%
        feeRecipient = _initialOwner;
        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
    }

    function setFeeRange(uint256 _min, uint256 _max) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minFeeBasis = _min;
        maxFeeBasis = _max;
    }

    function setFeeRecipient(address _recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_recipient == address(0)) {
            revert InvalidRecipient();
        }
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

    // add multiple pools to a protocol
    function addPools(
        string calldata _protocolName,
        bytes4[] calldata _poolIds,
        address[] calldata _poolAddresses
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_poolIds.length != _poolAddresses.length) {
            revert InvalidPoolData();
        }
        for (uint256 i = 0; i < _poolIds.length; i++) {
            _addPool(_protocolName, _poolIds[i], _poolAddresses[i]);
        }
    }

    /// add a single pool
    function addPool(
        string calldata _protocolName,
        bytes4 _poolId,
        address _poolAddress
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _addPool(_protocolName, _poolId, _poolAddress);
    }

    function _addPool(string calldata _protocolName, bytes4 _poolId, address _poolAddress) internal {
        if (protocolPools[_protocolName][_poolId] != address(0)) {
            revert PoolAlreadyAdded();
        }
        if (!hasRole(POOL_ROLE, _poolAddress)) {
            super.grantRole(POOL_ROLE, _poolAddress);
        }
        protocolPools[_protocolName][_poolId] = _poolAddress;
    }

    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address) {
        address poolAddress = protocolPools[_protocolName][_poolId];
        if (poolAddress == address(0) || !hasRole(POOL_ROLE, poolAddress)) {
            revert PoolNotAllowed();
        }
        return poolAddress;
    }

    function addAction(bytes4 _actionId, address _actionAddress) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert ActionAlreadyAdded();
        }
        if (!hasRole(ACTION_ROLE, _actionAddress)) {
            // if it doesn't have the role, maybe it has already been proposed
            // and we can just grant it
            super.grantRole(ACTION_ROLE, _actionAddress);
        }
        actionAddresses[_actionId] = _actionAddress;
    }

    function getActionAddress(bytes4 _actionId) external view returns (address) {
        return actionAddresses[_actionId];
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
}
