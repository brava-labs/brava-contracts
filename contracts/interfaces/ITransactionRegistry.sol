// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title ITransactionRegistry
/// @notice Interface for the TransactionRegistry contract
interface ITransactionRegistry {
    /// @notice Proposes a transaction for approval
    /// @param _txHash The hash of the transaction to propose
    function proposeTransaction(bytes32 _txHash) external;

    /// @notice Cancels a transaction proposal
    /// @param _txHash The hash of the transaction proposal to cancel
    function cancelTransactionProposal(bytes32 _txHash) external;

    /// @notice Approves a proposed transaction after the delay period
    /// @param _txHash The hash of the transaction to approve
    function approveTransaction(bytes32 _txHash) external;

    /// @notice Revokes an approved transaction
    /// @param _txHash The hash of the transaction to revoke
    function revokeTransaction(bytes32 _txHash) external;

    /// @notice Checks if a transaction hash has been approved
    /// @param _txHash The hash of the transaction to check
    /// @return bool True if the transaction is approved
    function isApprovedTransaction(bytes32 _txHash) external view returns (bool);
} 