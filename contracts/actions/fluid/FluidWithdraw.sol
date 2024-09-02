// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {IFToken} from "../../interfaces/fluid/IFToken.sol";
import {ActionUtils} from "../../libraries/ActionUtils.sol";
import {ParamSelectorLib} from "../../libraries/ParamSelector.sol";
/// @title Burns fTokens and receive underlying tokens in return
/// @dev fTokens need to be approved for user's wallet to pull them (fToken address)
contract FluidWithdraw is ActionBase {
    using TokenUtils for address;
    using ParamSelectorLib for *;

    /// @param token - address of fToken contract
    /// @param amount - amount of fToken to withdraw
    struct Params {
        address token;
        uint256 amount;
    }

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues,
        uint16 _strategyId
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        inputData.amount = inputData.amount._paramSelector(_paramMapping[1], _returnValues);

        (uint256 amountReceived, bytes memory logData) = _fluidWithdraw(inputData, _strategyId);
        logger.logActionEvent("FluidWithdraw", logData);
        return (bytes32(amountReceived));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidWithdraw(
        Params memory _inputData,
        uint16 _strategyId
    ) private returns (uint256 tokenAmountReceived, bytes memory logData) {
        IFToken fToken = IFToken(_inputData.token);

        address underlyingToken = fToken.asset();

        uint256 fBalanceBefore = address(fToken).getBalance(address(this));
        uint256 underlyingTokenBalanceBefore = underlyingToken.getBalance(address(this));
        fToken.withdraw(_inputData.amount, address(this), address(this));
        uint256 fBalanceAfter = address(fToken).getBalance(address(this));
        uint256 underlyingTokenBalanceAfter = underlyingToken.getBalance(address(this));
        tokenAmountReceived = underlyingTokenBalanceAfter - underlyingTokenBalanceBefore;

        logData = abi.encode(_inputData, tokenAmountReceived);

        logger.logActionEvent(
            "BalanceUpdate",
            ActionUtils._encodeBalanceUpdate(
                _strategyId,
                ActionUtils._poolIdFromAddress(_inputData.token),
                fBalanceBefore,
                fBalanceAfter
            )
        );
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
