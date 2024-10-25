// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

interface ILogger {
    event ActionEvent(address caller, uint256 logId, bytes data);
    event AdminVaultEvent(uint256 logId, bytes data);

    function logActionEvent(uint256 _logId, bytes memory _data) external;
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) external;
}
