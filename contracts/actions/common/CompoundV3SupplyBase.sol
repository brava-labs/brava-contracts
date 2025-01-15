// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {IComet} from "../../interfaces/compound/IComet.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title CompoundV3SupplyBase - Base contract for supplying to Compound III markets
/// @notice This contract provides base functionality for supplying to Compound III markets
/// @dev To be inherited by specific Compound III like supply implementations
abstract contract CompoundV3SupplyBase is ActionBase {
    using SafeERC20 for IERC20;

    /// @dev Params for the supply action
    /// @param poolId - The pool ID for the pool
    /// @param feeBasis - The fee basis for any fees to be taken
    /// @param amount - The amount to supply
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

        uint256 underlyingTokenBalance = IERC20(underlyingToken).balanceOf(address(this));
        uint256 additionalRequiredForFee = 0;

        // Handle fees if any
        if (feeInTokens > 0) {
            // Check if we need to withdraw more tokens to cover the fee
            if (feeInTokens > underlyingTokenBalance) {
                additionalRequiredForFee = feeInTokens - underlyingTokenBalance;
                // Withdraw the additional amount needed
                IComet(poolAddress).withdraw(underlyingToken, additionalRequiredForFee);
            }
            
            // Transfer the fee to recipient
            IERC20(underlyingToken).safeTransfer(ADMIN_VAULT.feeConfig().recipient, feeInTokens);
        }

        // Always set the fee timestamp, even on first deposit when there are no fees
        ADMIN_VAULT.setFeeTimestamp(poolAddress);

        // Calculate amount to supply (reduce by fees if needed)
        uint256 amountToSupply;
        if (params.amount == type(uint256).max) {
            amountToSupply = IERC20(underlyingToken).balanceOf(address(this));
        } else {
            // Handle potential underflow by checking if we have enough to deposit after fees
            amountToSupply = additionalRequiredForFee >= params.amount ? 0 : params.amount - additionalRequiredForFee;
        }

        // Only proceed with deposit if we have tokens to deposit
        if (amountToSupply > 0) {
            IERC20(underlyingToken).safeIncreaseAllowance(poolAddress, amountToSupply);
            IComet(poolAddress).supply(underlyingToken, amountToSupply);
        }

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
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure virtual override returns (string memory);
}
