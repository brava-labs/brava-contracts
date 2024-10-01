// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IFluidLending} from "../../interfaces/fluid/IFToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Supplies tokens to Fluid vault
contract FluidSupply is ActionBase {
    using SafeERC20 for IERC20;

    // TODO: Implement unified error reporting for all actions.
    error FluidSupply__ZeroAmount();

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

    constructor(address _adminVault, address _registry, address _logger) ActionBase(_adminVault, _registry, _logger) {}

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
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidSupply(
        Params memory _inputData
    ) private returns (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) {
        IFluidLending fToken = IFluidLending(_inputData.fToken);
        fBalanceBefore = fToken.balanceOf(address(this));

        // Check fee status
        if (fBalanceBefore == 0) {
            // Balance is zero, initialize fee timestamp for future fee calculations
            ADMIN_VAULT.initializeFeeTimestamp(_inputData.fToken);
        } else {
            // Balance is non-zero, take fees before depositing
            feeInTokens = _takeFee(_inputData.fToken, _inputData.feeBasis);
        }

        // Deposit tokens
        if (_inputData.amount != 0) {
            IERC20 stableToken = IERC20(fToken.asset());
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? stableToken.balanceOf(address(this))
                : _inputData.amount;

            // If our max is zero, we messed up.
            if (amountToDeposit == 0) {
                revert FluidSupply__ZeroAmount();
            }
            stableToken.safeIncreaseAllowance(_inputData.fToken, amountToDeposit);

            fToken.deposit(_inputData.amount, address(this), _inputData.minSharesReceived);
        }

        fBalanceAfter = fToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
