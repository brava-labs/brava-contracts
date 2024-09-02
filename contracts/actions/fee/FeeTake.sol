// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {ParamSelectorLib} from "../../libraries/ParamSelector.sol";
/// @title Helper action to send a token to the specified address
contract FeeTake is ActionBase {
    using TokenUtils for address;
    using ParamSelectorLib for uint256;

    struct Params {
        address from;
        address feeToken;
        uint256 amount;
    }

    address payable public immutable FEE_RECIPIENT;

    constructor(address _registry, address _logger, address _feeRecipient) ActionBase(_registry, _logger) {
        FEE_RECIPIENT = payable(_feeRecipient);
    }

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues,
        uint16 /*_strategyId*/
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = parseInputs(_callData);

        inputData.from = _parseParamAddr(inputData.from, _paramMapping[0], _returnValues);
        inputData.feeToken = _parseParamAddr(inputData.feeToken, _paramMapping[1], _returnValues);
        inputData.amount._paramSelector(_paramMapping[2], _returnValues);

        _takeFee(inputData);

        logger.logActionEvent("FeeTake", abi.encode(inputData));
        return bytes32(inputData.amount);
    }

    function _takeFee(Params memory _inputData) internal {
        _inputData.feeToken.pullTokens(_inputData.from, _inputData.amount);
        _inputData.feeToken.withdrawTokens(FEE_RECIPIENT, _inputData.amount);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.FEE_ACTION);
    }

    function parseInputs(bytes memory _callData) public pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
