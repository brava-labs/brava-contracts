// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {IContractRegistry} from "../interfaces/IContractRegistry.sol";
import {Logger} from "../Logger.sol";

// TODOs for each actions
// private parsing function for each action
// improve logging with indexer in mind
// utilize ContractRegistry for all actions (?)
// do we go with fixed version or ^0.8.0

/// @title Implements Action interface and common helpers for passing inputs
abstract contract ActionBase {
    IContractRegistry public immutable REGISTRY;

    Logger public immutable LOGGER;

    /// @dev If the input value should not be replaced
    uint8 public constant NO_PARAM_MAPPING = 0;

    uint8 public constant WALLET_ADDRESS_PARAM_MAPPING = 254;
    uint8 public constant OWNER_ADDRESS_PARAM_MAPPING = 255;

    enum ActionType {
        DEPOSIT_ACTION,
        WITHDRAW_ACTION,
        SWAP_ACTION,
        COVER_ACTION,
        FEE_ACTION,
        TRANSFER_ACTION,
        CUSTOM_ACTION
    }

    constructor(address _registry, address _logger) {
        REGISTRY = IContractRegistry(_registry);
        LOGGER = Logger(_logger);
    }

    /// @notice Parses inputs and runs the implemented action through a user wallet
    /// @dev Is called by the RecipeExecutor chaining actions together
    /// @param _callData Array of input values each value encoded as bytes
    /// @param _strategyId The index of the strategy the action is related to
    /// @return Returns a bytes32 value through user wallet, each actions implements what that value is
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual returns (bytes32);

    /// @notice Returns the type of action we are implementing
    function actionType() public pure virtual returns (uint8);
}
