// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title IMapleWithdrawalManager
/// @notice Interface for interacting with Maple Finance's WithdrawalManager
interface IMapleWithdrawalManager {
    /// @notice Returns the request ID for a given owner address
    /// @param owner Address of the owner of the withdrawal request
    /// @return requestId The ID of the owner's withdrawal request (0 if none exists)
    function requestIds(address owner) external view returns (uint128);
    
    /// @notice Returns the next and last request IDs in the queue
    /// @return nextRequestId The ID of the next request to be processed
    /// @return lastRequestId The ID of the last request in the queue
    function queue() external view returns (uint128 nextRequestId, uint128 lastRequestId);
} 