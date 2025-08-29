// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

/// @title IAction
/// @notice Interface for action contracts
interface IAction {
    /// @notice Execute an action with given calldata
    /// @param _callData The encoded function call data
    /// @param _strategyId Strategy identifier for the action
    function executeAction(bytes memory _callData, uint16 _strategyId) external payable;
}
