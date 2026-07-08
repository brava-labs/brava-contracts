// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.28;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

/// @title Logger
/// @notice Central event hub for the Brava protocol. Emits structured events
///         consumed by off-chain indexers and the security screener.
/// @dev Every event carries its emitter as `caller` (msg.sender). The contract
///      is permissionless; consumers establish trust by filtering events on
///      `caller`, so the Logger needs no privileged maintenance surface.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract Logger is Initializable {
    /// @notice Emitted by action contracts (delegatecalled from user Safes, so `caller` is the Safe)
    event ActionEvent(address caller, uint8 logId, bytes data);

    /// @notice Emitted by admin/governance contracts; `caller` identifies the emitting contract
    event AdminVaultEvent(address caller, uint256 logId, bytes data);

    /// @dev Storage slots occupied by the live proxy's prior caller whitelist.
    ///      Retained unused so proxy upgrades preserve the existing layout.
    address private _reservedSlot0;
    mapping(address => bool) private _reservedSlot1;

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

    /// @notice Logs an event from an admin/governance contract
    /// @param _logId The ID of the log
    /// @param _data The data to log
    /// @dev These events are important, they will be a permission change.
    ///      The logId initial digit is the type of event:
    ///      1XX = Proposal, 2XX = Grant, 3XX = Cancel, 4XX = Removal
    ///      The next two digits are what category this permission change belongs to:
    ///      00 = DelayChange, 01 = Action, 02 = Pool, 03 = Fees, 04 = Role,
    ///      05 = Transaction/Config, 06 = Token, 07 = SafeSetup, 08 = SafeDeploy
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) public {
        emit AdminVaultEvent(msg.sender, _logId, _data);
    }
}
