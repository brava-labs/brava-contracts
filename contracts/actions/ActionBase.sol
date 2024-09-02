// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import "../interfaces/IContractRegistry.sol";
import {Logger} from "../Logger.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";

// TODOs for each actions
// private parsing function for each action
// improve logging with indexer in mind
// utilize ContractRegistry for all actions (?)
// do we go with fixed version or ^0.8.0


/// @title Implements Action interface and common helpers for passing inputs
abstract contract ActionBase {

    IContractRegistry public immutable registry;

    Logger public immutable logger;

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
        registry = IContractRegistry(_registry);
        logger = Logger(_logger);
    }

    /// @notice Parses inputs and runs the implemented action through a user wallet
    /// @dev Is called by the RecipeExecutor chaining actions together
    /// @param _callData Array of input values each value encoded as bytes
    /// @param _paramMapping Array that specifies how return values are mapped in input
    /// @param _returnValues Returns values from actions before, which can be injected in inputs
    /// @param _strategyId The index of the strategy the action is related to
    /// @return Returns a bytes32 value through user wallet, each actions implements what that value is
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues,
        uint16 _strategyId
    ) public payable virtual returns (bytes32);

    /// @notice Returns the type of action we are implementing
    function actionType() public pure virtual returns (uint8);

    //////////////////////////// HELPER METHODS ////////////////////////////

    /// @notice Given an uint256 input, injects return/sub values if specified
    /// @param _param The original input value
    /// @param _mapType Indicated the type of the input in paramMapping
    /// @param _returnValues Array of subscription data we can replace the input value with
    function _parseParamUint(uint _param, uint8 _mapType, bytes32[] memory _returnValues) internal pure returns (uint) {
        if (isReplaceable(_mapType)) {
            _param = uint(_returnValues[getReturnIndex(_mapType)]);
        }
        return _param;
    }

    /// @notice Given an addr input, injects return/sub values if specified
    /// @param _param The original input value
    /// @param _mapType Indicated the type of the input in paramMapping
    /// @param _returnValues Array of subscription data we can replace the input value with
    function _parseParamAddr(
        address _param,
        uint8 _mapType,
        bytes32[] memory _returnValues
    ) internal view returns (address) {
        if (isReplaceable(_mapType)) {
                /// @dev The last two values are specially reserved for proxy addr and owner addr
                if (_mapType == WALLET_ADDRESS_PARAM_MAPPING) return address(this); // wallet address
                if (_mapType == OWNER_ADDRESS_PARAM_MAPPING) return fetchOwnersOrWallet(); // owner if 1/1 wallet or the wallet itself
                return address(bytes20((_returnValues[getReturnIndex(_mapType)])));
            }
        return _param;
    }

    /// @notice Given an bytes32 input, injects return/sub values if specified
    /// @param _param The original input value
    /// @param _mapType Indicated the type of the input in paramMapping
    /// @param _returnValues Array of subscription data we can replace the input value with
    function _parseParamABytes32(
        bytes32 _param,
        uint8 _mapType,
        bytes32[] memory _returnValues
    ) internal pure returns (bytes32) {
        if (isReplaceable(_mapType)) {
            _param = (_returnValues[getReturnIndex(_mapType)]);
        }
        return _param;
    }

    /// @notice Checks if the paramMapping value indicated that we need to inject values
    /// @param _type Indicated the type of the input
    function isReplaceable(uint8 _type) internal pure returns (bool) {
        return _type != NO_PARAM_MAPPING;
    }

    /// @notice Transforms the paramMapping value to the index in return array value
    /// @param _type Indicated the type of the input
    function getReturnIndex(uint8 _type) internal pure returns (uint8) {
        return _type - 1;
    }

    function fetchOwnersOrWallet() internal view returns (address) {
        address[] memory owners = ISafe(address(this)).getOwners();
        return owners.length == 1 ? owners[0] : address(this);
    }

}
