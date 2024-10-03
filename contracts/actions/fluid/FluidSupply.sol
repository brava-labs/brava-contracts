// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IFluidLending} from "../../interfaces/fluid/IFToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "hardhat/console.sol";

/// @title Supplies tokens to Fluid vault
contract FluidSupply is ActionBase {
    using SafeERC20 for IERC20;

    // TODO: Implement unified error reporting for all actions.
    error FluidSupply__ZeroAmount();

    /// @param poolId - ID of fToken vault contract
    /// @param amount - amount of underlying token to withdraw
    /// @param feeBasis - fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param minSharesReceived - minimum amount of shares to receive
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual override {
        // parse input data
        Params memory inputData = _parseInputs(_callData);

        // verify input data
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address fToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);
        // execute logic
        (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) = _fluidSupply(inputData, fToken);

        // log event
        LOGGER.logActionEvent(
            "BalanceUpdate",
            _encodeBalanceUpdate(_strategyId, inputData.poolId, fBalanceBefore, fBalanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidSupply(
        Params memory _inputData,
        address _fTokenAddress
    ) private returns (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) {
        IFluidLending fToken = IFluidLending(_fTokenAddress);
        fBalanceBefore = fToken.balanceOf(address(this));

        // Check fee status
        if (fBalanceBefore == 0) {
            // Balance is zero, initialize fee timestamp for future fee calculations
            ADMIN_VAULT.initializeFeeTimestamp(_fTokenAddress);
        } else {
            // Balance is non-zero, take fees before depositing
            feeInTokens = _takeFee(_fTokenAddress, _inputData.feeBasis);
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
            stableToken.safeIncreaseAllowance(_fTokenAddress, amountToDeposit);

            fToken.deposit(_inputData.amount, address(this), _inputData.minSharesReceived);
        }

        fBalanceAfter = fToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    function protocolName() internal pure override returns (string memory) {
        return "Fluid";
    }
}
