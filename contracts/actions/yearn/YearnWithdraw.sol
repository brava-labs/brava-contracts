// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {ActionUtils} from "../../libraries/ActionUtils.sol";
import {ParamSelectorLib} from "../../libraries/ParamSelector.sol";
/// @title Burns yTokens and receive underlying tokens in return
/// @dev yTokens need to be approved for user's wallet to pull them (yToken address)
contract YearnWithdraw is ActionBase {
    using TokenUtils for address;
    using ParamSelectorLib for *;

    /// @param token - address of yToken to withdraw (same as yVault address)
    /// @param amount - amount of yToken to withdraw
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

        (uint256 amountReceived, bytes memory logData) = _yearnWithdraw(inputData, _strategyId);
        logger.logActionEvent("YearnWithdraw", logData);
        return (bytes32(amountReceived));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _yearnWithdraw(
        Params memory _inputData,
        uint16 _strategyId
    ) private returns (uint256 tokenAmountReceived, bytes memory logData) {
        IYearnVault vault = IYearnVault(_inputData.token);

        address underlyingToken = vault.token();

        uint256 yBalanceBefore = address(vault).getBalance(address(this));
        uint256 underlyingTokenBalanceBefore = underlyingToken.getBalance(address(this));
        vault.withdraw(_inputData.amount, address(this));
        uint256 yBalanceAfter = address(vault).getBalance(address(this));
        uint256 underlyingTokenBalanceAfter = underlyingToken.getBalance(address(this));
        tokenAmountReceived = underlyingTokenBalanceAfter - underlyingTokenBalanceBefore;

        logData = abi.encode(_inputData, tokenAmountReceived);

        logger.logActionEvent(
            "BalanceUpdate",
            ActionUtils._encodeBalanceUpdate(
                _strategyId,
                ActionUtils._poolIdFromAddress(address(vault)),
                yBalanceBefore,
                yBalanceAfter
            )
        );
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
