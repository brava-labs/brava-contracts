// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

interface ILogger {
    event ActionEvent(address indexed caller, uint256 indexed logId, bytes data);
    event AdminVaultEvent(string indexed logName, bytes data);

    function logActionEvent(uint256 _logId, bytes memory _data) external;
    function logAdminVaultEvent(string memory _logName, bytes memory _data) external;
}
