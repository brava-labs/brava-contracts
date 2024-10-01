// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IFluidLending} from "../../interfaces/fluid/IFToken.sol";

/// @title Burns fTokens and receive underlying tokens in return
/// @dev fTokens need to be approved for user's wallet to pull them (fToken address)
contract FluidWithdraw is ActionBase {
    // TODO: Implement unified error reporting for all actions.
    error FluidWithdraw__ZeroAmount();

    /// @param fToken - address of fToken vault contract
    /// @param amount - amount of underlying token to withdraw
    /// @param feeBasis - fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param maxSharesBurned - maximum amount of fTokens to burn
    struct Params {
        address fToken;
        uint256 withdrawRequest;
        uint256 feeBasis;
        uint256 maxSharesBurned;
    }

    constructor(address _adminVault, address _registry, address _logger) ActionBase(_adminVault, _registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual override {
        // parse input data
        Params memory inputData = _parseInputs(_callData);

        // verify input data
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        // TODO: Verify the fToken is a whitelisted contract

        // execute logic
        (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) = _fluidWithdraw(inputData);

        // log event
        LOGGER.logActionEvent(
            "BalanceUpdate",
            _encodeBalanceUpdate(
                _strategyId,
                _poolIdFromAddress(inputData.fToken),
                fBalanceBefore,
                fBalanceAfter,
                feeInTokens
            )
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    function exit(address _fToken) public {
        IFluidLending fToken = IFluidLending(_fToken);
        uint256 maxWithdrawAmount = fToken.maxWithdraw(address(this));
        fToken.withdraw(maxWithdrawAmount, address(this), address(this));
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// Calcualte and take fees, then withdraw the underlying token
    function _fluidWithdraw(
        Params memory _inputData
    ) private returns (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) {
        IFluidLending fToken = IFluidLending(_inputData.fToken);

        fBalanceBefore = fToken.balanceOf(address(this));

        // Take any fees before doing any further actions
        feeInTokens = _takeFee(address(fToken), _inputData.feeBasis);

        // If withdraw request is zero this was only a fee take, so we can skip the rest
        if (_inputData.withdrawRequest != 0) {
            // If withdraw exceeds balance, withdraw max
            uint256 maxWithdrawAmount = fToken.maxWithdraw(address(this));
            uint256 amountToWithdraw = _inputData.withdrawRequest > maxWithdrawAmount
                ? maxWithdrawAmount
                : _inputData.withdrawRequest;

            // If our max is zero, we messed up.
            if (amountToWithdraw == 0) {
                revert FluidWithdraw__ZeroAmount();
            }
            fToken.withdraw(amountToWithdraw, address(this), address(this), _inputData.maxSharesBurned);
        }
        fBalanceAfter = fToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
