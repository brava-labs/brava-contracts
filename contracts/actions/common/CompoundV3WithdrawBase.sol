// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {IComet} from "../../interfaces/compound/IComet.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title CompoundV3WithdrawBase - Base contract for withdrawing from Compound III markets
/// @notice This contract provides base functionality for withdrawing from Compound III markets
/// @dev To be inherited by specific Compound III like withdraw implementations
abstract contract CompoundV3WithdrawBase is ActionBase {
    using SafeERC20 for IERC20;


    /// @dev Params for the withdraw action
    /// @param poolId - The pool ID for the pool
    /// @param feeBasis - The fee basis for any fees to be taken
    /// @param amount - The amount to withdraw
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory params = abi.decode(_callData, (Params));

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(params.feeBasis);
        address poolAddress = ADMIN_VAULT.getPoolAddress(protocolName(), params.poolId);
        address underlyingToken = IComet(poolAddress).baseToken();

        // Get balances before
        uint256 balanceBefore = IComet(poolAddress).balanceOf(address(this));

        // Calculate fees if any
        uint256 lastFeeTimestamp = ADMIN_VAULT.getLastFeeTimestamp(poolAddress);
        uint256 feeInTokens = _calculateFee(balanceBefore, params.feeBasis, lastFeeTimestamp, block.timestamp);

        // Calculate amount to withdraw
        uint256 amountToWithdraw;
        if (params.amount == type(uint256).max) {
            // If withdrawing max, we need to leave enough for fees
            amountToWithdraw = feeInTokens >= balanceBefore ? 0 : balanceBefore - feeInTokens;
        } else {
            // If specific amount requested, ensure we don't exceed balance with fees
            uint256 totalNeeded = params.amount + feeInTokens;
            amountToWithdraw = totalNeeded > balanceBefore ? balanceBefore - feeInTokens : params.amount;
        }

        require(
            amountToWithdraw + feeInTokens <= balanceBefore,
            Errors.Action_MaxSharesBurnedExceeded(
                protocolName(),
                actionType(),
                amountToWithdraw + feeInTokens,
                balanceBefore
            )
        );

        // Withdraw tokens (including fees if any)
        if (amountToWithdraw + feeInTokens > 0) {
            IComet(poolAddress).withdraw(underlyingToken, amountToWithdraw + feeInTokens);

            // Transfer fees if any
            if (feeInTokens > 0) {
                IERC20(underlyingToken).safeTransfer(ADMIN_VAULT.feeConfig().recipient, feeInTokens);
            }
        }

        // Always set the fee timestamp, even if no fees taken
        ADMIN_VAULT.setFeeTimestamp(poolAddress);

        // Get balances after
        uint256 balanceAfter = IComet(poolAddress).balanceOf(address(this));

        // Log event
        LOGGER.logActionEvent(
            ActionBase.LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, params.poolId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure virtual override returns (string memory);
} 