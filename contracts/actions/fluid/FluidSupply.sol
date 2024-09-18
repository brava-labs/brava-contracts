// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {IFluidLending} from "../../interfaces/fluid/IFToken.sol";
import {ActionUtils} from "../../libraries/ActionUtils.sol";

/// @title Supplies tokens to Yearn vault
/// @dev tokens need to be approved for user's wallet to pull them (token address)
contract FluidSupply is ActionBase {
    using TokenUtils for address;

    /// @param token - address of fToken contract
    /// @param amount - amount of token to supply
    struct Params {
        address token;
        uint256 amount;
    }

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint16 _strategyId
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        uint256 fAmountReceived = _fluidSupply(inputData, _strategyId);
        return bytes32(fAmountReceived);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidSupply(Params memory _inputData, uint16 _strategyId) private returns (uint256 fTokenAmount) {
        IFluidLending fToken = IFluidLending(address(_inputData.token));

        address stableToken = fToken.asset();
        stableToken.approveToken(address(fToken), _inputData.amount);

        uint256 fBalanceBefore = address(fToken).getBalance(address(this));
        uint256 returnValue = fToken.deposit(_inputData.amount, address(this));
        uint256 fBalanceAfter = address(fToken).getBalance(address(this));
        fTokenAmount = fBalanceAfter - fBalanceBefore;
        assert(fTokenAmount == returnValue);

        LOGGER.logActionEvent(
            "BalanceUpdate",
            ActionUtils._encodeBalanceUpdate(
                _strategyId,
                ActionUtils._poolIdFromAddress(address(fToken)),
                fBalanceBefore,
                fBalanceAfter
            )
        );
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
