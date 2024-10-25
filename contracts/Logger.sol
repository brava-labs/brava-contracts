// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {ILogger} from "./interfaces/ILogger.sol";

contract Logger is ILogger {

    /// @notice Logs an event from an action
    /// @param _logId The ID of the log
    /// @param _data The data to log
    function logActionEvent(uint256 _logId, bytes memory _data) public {
        emit ActionEvent(msg.sender, _logId, _data);
    }

    /// @notice Logs an event from the AdminVault
    /// @param _logId The ID of the log
    /// @param _data The data to log
    /// @dev These events are important, they will be a permission change.
    // The logId initial digit is the type of event:
    // 1XX = Proposal, 2XX = Grant, 3XX = Cancel, 4XX = Removal
    // The next two digits are what category this permission change belongs to:
    // 00 = DelayChange, 01 = Action, 02 = Pool, 03 = Fees
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) public {
        emit AdminVaultEvent(_logId, _data);
    }
}
