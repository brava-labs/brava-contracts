// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

contract Logger {
    event ActionEvent(address indexed caller, uint256 indexed logId, bytes data);
    event AdminVaultEvent(string indexed logName, bytes data);

    /// @notice Logs an event from an action
    /// @param _logId The ID of the log
    /// @param _data The data to log
    function logActionEvent(uint256 _logId, bytes memory _data) public {
        emit ActionEvent(msg.sender, _logId, _data);
    }

    /// @notice Logs an event from the AdminVault
    /// @param _logName The name of the log
    /// @param _data The data to log
    /// @dev These events are important, they will be a permission change.
    function logAdminVaultEvent(string memory _logName, bytes memory _data) public {
        emit AdminVaultEvent(_logName, _data);
    }
}
