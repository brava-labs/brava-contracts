// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IActionBase} from "./IActionBase.sol";

interface ILogger {
    event ActionEvent(address caller, IActionBase.LogType logId, bytes data);
    event AdminVaultEvent(uint256 logId, bytes data);

    function logActionEvent(IActionBase.LogType _logType, bytes memory _data) external;
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) external;
}
