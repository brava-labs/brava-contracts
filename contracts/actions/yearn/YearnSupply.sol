// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {IYearnRegistry} from "../../interfaces/yearn/IYearnRegistry.sol";
import {ActionUtils} from "../../libraries/ActionUtils.sol";

/// @title Supplies tokens to Yearn vault
/// @dev tokens need to be approved for user's wallet to pull them (token address)
contract YearnSupply is ActionBase {
    using TokenUtils for address;

    /// @param token - address of token to supply
    /// @param amount - amount of token to supply
    struct Params {
        address token;
        uint256 amount;
    }

    IYearnRegistry public constant YEARN_REGISTRY = IYearnRegistry(address(0x50c1a2eA0a861A967D9d0FFE2AE4012c2E053804));

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint16 _strategyId
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        (uint256 yAmountReceived, bytes memory logData) = _yearnSupply(inputData, _strategyId);
        LOGGER.logActionEvent("YearnSupply", logData);
        return bytes32(yAmountReceived);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _yearnSupply(
        Params memory _inputData,
        uint16 _strategyId
    ) private returns (uint256 yTokenAmount, bytes memory logData) {
        IYearnVault vault = IYearnVault(YEARN_REGISTRY.latestVault(_inputData.token));

        _inputData.token.approveToken(address(vault), _inputData.amount);

        uint256 yBalanceBefore = address(vault).getBalance(address(this));
        vault.deposit(_inputData.amount, address(this));
        uint256 yBalanceAfter = address(vault).getBalance(address(this));
        yTokenAmount = yBalanceAfter - yBalanceBefore;

        logData = abi.encode(_inputData, yTokenAmount);

        LOGGER.logActionEvent(
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
