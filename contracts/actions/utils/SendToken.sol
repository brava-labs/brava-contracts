// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title Helper action to send a token to the specified address
// TODO tests
contract SendToken is ActionBase {
    using TokenUtils for address;

    /// @param tokenAddr Address of token, use 0xEeee... for eth
    /// @param to Where the tokens are sent
    /// @param amount Amount of tokens, can be type(uint).max
    struct Params {
        address tokenAddr;
        address to;
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
        inputData.to = _parseParamAddr(inputData.to, _paramMapping[1], _returnValues);
        inputData.amount = _parseParamUint(inputData.amount, _paramMapping[2], _returnValues);

        inputData.amount = _sendToken(inputData.tokenAddr, inputData.to, inputData.amount);

        return bytes32(inputData.amount);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.TRANSFER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Sends a token to the specified addr, works with Eth also
    /// @dev If amount is type(uint).max it will send whole user's wallet balance
    /// @param _tokenAddr Address of token, use 0xEeee... for eth
    /// @param _to Where the tokens are sent
    /// @param _amount Amount of tokens, can be type(uint).max
    function _sendToken(address _tokenAddr, address _to, uint256 _amount) internal returns (uint256) {
        _amount = _tokenAddr.withdrawTokens(_to, _amount);

        return _amount;
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }
}
