// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {IFluidLending} from "../../interfaces/fluid/IFToken.sol";
import {ActionUtils} from "../../libraries/ActionUtils.sol";
import {AdminAuth} from "../../auth/AdminAuth.sol";

/// @title Supplies tokens to Fluid vault
contract FluidSupply is ActionBase, AdminAuth {
    using TokenUtils for address;

    // TODO: Implement unified error reporting for all actions.
    error FluidSupply__ZeroAmount();
    error FluidSupply__InvalidAddress();

    /// @param fToken - address of fToken vault contract
    /// @param amount - amount of underlying token to withdraw
    /// @param feeBasis - fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param minSharesReceived - minimum amount of shares to receive
    struct Params {
        address fToken;
        uint256 amount;
        uint256 feeBasis;
        uint256 minSharesReceived;
    }

    constructor(
        address _registry,
        address _logger,
        address _adminVault
    ) ActionBase(_registry, _logger) AdminAuth(_adminVault) {
        if (_registry == address(0) || _logger == address(0) || _adminVault == address(0)) {
            revert FluidSupply__InvalidAddress();
        }
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual override {
        // parse input data
        Params memory inputData = _parseInputs(_callData);

        // verify input data
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        // TODO: Verify the fToken is a whitelisted contract

        // execute logic
        (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) = _fluidSupply(inputData);

        // log event
        LOGGER.logActionEvent(
            "BalanceUpdate",
            ActionUtils._encodeBalanceUpdate(
                _strategyId,
                ActionUtils._poolIdFromAddress(inputData.fToken),
                fBalanceBefore,
                fBalanceAfter,
                feeInTokens
            )
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidSupply(
        Params memory _inputData
    ) private returns (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) {
        IFluidLending fToken = IFluidLending(address(_inputData.fToken));
        fBalanceBefore = address(fToken).getBalance(address(this));

        // Check fee status
        if (fBalanceBefore == 0) {
            // Balance is zero, initialize fee timestamp for future fee calculations
            ADMIN_VAULT.initializeFeeTimestamp(address(fToken));
        } else {
            // Balance is non-zero, take fees before depositing
            feeInTokens = _takeFee(address(fToken), _inputData.feeBasis);
        }

        // Deposit tokens
        if (_inputData.amount != 0) {
            address stableToken = fToken.asset();
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? stableToken.getBalance(address(this))
                : _inputData.amount;

            // If our max is zero, we messed up.
            if (amountToDeposit == 0) {
                revert FluidSupply__ZeroAmount();
            }
            stableToken.approveToken(address(fToken), amountToDeposit);

            fToken.deposit(_inputData.amount, address(this), _inputData.minSharesReceived);
        }

        fBalanceAfter = address(fToken).getBalance(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
