// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ActionBase} from "../actions/ActionBase.sol";

interface ILogger {
    event ActionEvent(address caller, ActionBase.LogType logId, bytes data);
    event AdminVaultEvent(uint256 logId, bytes data);

    function logActionEvent(ActionBase.LogType _logType, bytes memory _data) external;
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) external;
}
