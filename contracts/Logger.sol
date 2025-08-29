// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0

pragma solidity =0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract Logger is Initializable {
    /// @notice Events to match the ILogger interface
    event ActionEvent(address caller, uint8 logId, bytes data);
    event AdminVaultEvent(uint256 logId, bytes data);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initializes the contract
    // solhint-disable-next-line no-empty-blocks
    function initialize() external initializer {
        /// @dev No initialization needed for this contract
    }

    /// @notice Logs an event from an action
    /// @param _logType The type of the log as uint8 (allows any enum value from ActionBase.LogType)
    /// @param _data The data to log
    function logActionEvent(uint8 _logType, bytes memory _data) public {
        emit ActionEvent(msg.sender, _logType, _data);
    }

    /// @notice Logs an event from the AdminVault
    /// @param _logId The ID of the log
    /// @param _data The data to log
    /// @dev These events are important, they will be a permission change.
    // The logId initial digit is the type of event:
    // 1XX = Proposal, 2XX = Grant, 3XX = Cancel, 4XX = Removal
    // The next two digits are what category this permission change belongs to:
    // 00 = DelayChange, 01 = Action, 02 = Pool, 03 = Fees, 04 = Role, 05 = Transaction
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) public {
        emit AdminVaultEvent(_logId, _data);
    }
}
