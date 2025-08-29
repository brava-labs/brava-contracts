// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

/// @title ITokenRegistry Interface
/// @notice Interface for the TokenRegistry contract that manages token approvals
interface ITokenRegistry {
    /// @notice Proposes a new token for approval
    /// @param _token The address of the token contract to propose
    function proposeToken(address _token) external;

    /// @notice Cancels a token proposal
    /// @param _token The address of the token contract to cancel
    function cancelTokenProposal(address _token) external;

    /// @notice Approves a proposed token
    /// @param _token The address of the token contract to approve
    function approveToken(address _token) external;

    /// @notice Revokes approval for a token
    /// @param _token The address of the token contract to revoke
    function revokeToken(address _token) external;

    /// @notice Checks if a token is approved
    /// @param _token The address of the token contract to check
    /// @return bool True if the token is approved, false otherwise
    function isApprovedToken(address _token) external view returns (bool);
} 