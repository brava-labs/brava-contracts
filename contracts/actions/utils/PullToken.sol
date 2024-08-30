// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title Helper action to pull a token from the specified address
// TODO tests
contract PullToken is ActionBase {
    using TokenUtils for address;

    /// @param tokenAddr Address of token
    /// @param from From where the tokens are pulled
    /// @param amount Amount of tokens, can be type(uint).max
    struct Params {
        address tokenAddr;
        address from;
        uint256 amount;
    }

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues,
        uint16 /*_strategyId*/
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        inputData.tokenAddr = _parseParamAddr(inputData.tokenAddr, _paramMapping[0], _returnValues);
        inputData.from = _parseParamAddr(inputData.from, _paramMapping[1], _returnValues);
        inputData.amount = _parseParamUint(inputData.amount, _paramMapping[2],  _returnValues);

        inputData.amount = _pullToken(inputData.tokenAddr, inputData.from, inputData.amount);

        return bytes32(inputData.amount);
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes memory _callData) public payable override {
        Params memory inputData = _parseInputs(_callData);

        _pullToken(inputData.tokenAddr, inputData.from, inputData.amount);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.TRANSFER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Pulls a token from the specified addr, doesn't work with ETH
    /// @dev If amount is type(uint).max it will send whole user's wallet balance
    /// @param _tokenAddr Address of token
    /// @param _from From where the tokens are pulled
    /// @param _amount Amount of tokens, can be type(uint).max
    function _pullToken(address _tokenAddr, address _from, uint _amount) internal returns (uint amountPulled) {
        amountPulled = _tokenAddr.pullTokens(_from, _amount);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }
}
