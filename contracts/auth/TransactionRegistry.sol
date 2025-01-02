// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../Errors.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ITransactionRegistry} from "../interfaces/ITransactionRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title TransactionRegistry
/// @notice Manages transaction approvals with a delay mechanism
/// @author BravaLabs.xyz
contract TransactionRegistry is Multicall, Roles, ITransactionRegistry {
    /// @notice The AdminVault contract that manages permissions
    IAdminVault public immutable ADMIN_VAULT;
    
    /// @notice The Logger contract for events
    ILogger public immutable LOGGER;

    /// @notice Mapping of transaction hashes to their approval status
    mapping(bytes32 => bool) public approvedTransactions;

    /// @notice Mapping of transaction hashes to their proposal timestamps
    mapping(bytes32 => uint256) public transactionProposals;

    /// @notice Initializes the TransactionRegistry
    /// @param _adminVault The address of the AdminVault contract
    /// @param _logger The address of the Logger contract
    constructor(address _adminVault, address _logger) {
        require(
            _adminVault != address(0) && _logger != address(0), 
            Errors.InvalidInput("TransactionRegistry", "constructor")
        );
        ADMIN_VAULT = IAdminVault(_adminVault);
        LOGGER = ILogger(_logger);
    }

    /// @notice Modifier to check if caller has a specific role
    modifier onlyRole(bytes32 role) {
        if (!ADMIN_VAULT.hasRole(role, msg.sender)) {
            revert Errors.AdminVault_MissingRole(role, msg.sender);
        }
        _;
    }

    /// @notice Gets the delay timestamp from AdminVault
    function _getDelayTimestamp() internal returns (uint256) {
        return ADMIN_VAULT.getDelayTimestamp();
    }

    /// @inheritdoc ITransactionRegistry
    function proposeTransaction(bytes32 _txHash) external onlyRole(Roles.TRANSACTION_PROPOSER_ROLE) {
        require(_txHash != bytes32(0), Errors.InvalidInput("TransactionRegistry", "proposeTransaction"));
        require(!approvedTransactions[_txHash], Errors.AdminVault_TransactionAlreadyApproved());

        transactionProposals[_txHash] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(105, abi.encode(_txHash));
    }

    /// @inheritdoc ITransactionRegistry
    function cancelTransactionProposal(bytes32 _txHash) external onlyRole(Roles.TRANSACTION_CANCELER_ROLE) {
        require(transactionProposals[_txHash] != 0, Errors.AdminVault_TransactionNotProposed());

        delete transactionProposals[_txHash];
        LOGGER.logAdminVaultEvent(305, abi.encode(_txHash));
    }

    /// @inheritdoc ITransactionRegistry
    function approveTransaction(bytes32 _txHash) external onlyRole(Roles.TRANSACTION_EXECUTOR_ROLE) {
        require(_txHash != bytes32(0), Errors.InvalidInput("TransactionRegistry", "approveTransaction"));
        require(!approvedTransactions[_txHash], Errors.AdminVault_TransactionAlreadyApproved());
        require(transactionProposals[_txHash] != 0, Errors.AdminVault_TransactionNotProposed());
        require(
            block.timestamp >= transactionProposals[_txHash],
            Errors.AdminVault_DelayNotPassed(block.timestamp, transactionProposals[_txHash])
        );

        delete transactionProposals[_txHash];
        approvedTransactions[_txHash] = true;
        LOGGER.logAdminVaultEvent(205, abi.encode(_txHash));
    }

    /// @inheritdoc ITransactionRegistry
    function revokeTransaction(bytes32 _txHash) external onlyRole(Roles.TRANSACTION_DISPOSER_ROLE) {
        require(approvedTransactions[_txHash], Errors.AdminVault_TransactionNotApproved(_txHash));

        delete approvedTransactions[_txHash];
        LOGGER.logAdminVaultEvent(405, abi.encode(_txHash));
    }

    /// @inheritdoc ITransactionRegistry
    function isApprovedTransaction(bytes32 _txHash) external view returns (bool) {
        return approvedTransactions[_txHash];
    }
} 