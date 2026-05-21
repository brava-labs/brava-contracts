// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IActionBase
/// @notice Shared enums and view functions for action contracts used across the protocol.
/// @dev Existing enum values should not be changed/removed, as they may be already in use by a deployed action.
interface IActionBase {
    /// @notice Returns the protocol name this action belongs to (e.g. "Aave", "Compound").
    function protocolName() external pure returns (string memory);

    /// @notice Returns the numeric action type as defined in the ActionType enum.
    function actionType() external pure returns (uint8);

    /// @notice Enum representing different types of actions
    enum ActionType {
        DEPOSIT_ACTION,
        WITHDRAW_ACTION,
        SWAP_ACTION,
        COVER_ACTION,
        FEE_ACTION,
        TRANSFER_ACTION,
        CUSTOM_ACTION
    }

    /// @notice Enum representing different types of logs.
    ///   UNUSED keeps the enum starting at index 1 for off-chain processing.
    enum LogType {
        UNUSED,
        BALANCE_UPDATE,
        BUY_COVER,
        CURVE_3POOL_SWAP,
        SEND_TOKEN,
        PULL_TOKEN,
        PARASWAP_SWAP,
        UPGRADE_ACTION,
        WITHDRAWAL_REQUEST,
        BUY_COVER_WITH_PREMIUM,
        ZERO_EX_SWAP,
        GAS_REFUND,
        CCTP_BRIDGE_SEND,
        GAS_REFUND_RESERVATION,
        SEQUENCE_COMPLETE,
        CCTP_BUNDLE_RECEIVE,
        CCTP_BRIDGE_SEND_WITH_AUTH,
        CCTP_RELAY_AND_EXECUTE
    }
}
