// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Supplies tokens to Yearn vault
/// @dev tokens need to be approved for user's wallet to pull them (token address)
contract YearnSupply is ActionBase {
    using SafeERC20 for IERC20;

    // TODO: Implement unified error reporting for all actions.
    error YearnSupply__InsufficientSharesReceived(uint256 sharesReceived, uint256 minSharesReceived);

    /// @param yToken - address of yToken vault contract
    /// @param amount - amount of underlying token to supply
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
        address yToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // execute logic
        (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) = _yearnSupply(inputData, yToken);

        // log event
        LOGGER.logActionEvent(
            "BalanceUpdate",
            _encodeBalanceUpdate(
                _strategyId,
                inputData.poolId,
                yBalanceBefore,
                yBalanceAfter,
                feeInTokens
            )
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _yearnSupply(
        Params memory _inputData,
        address _yToken
    ) private returns (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) {
        IYearnVault yToken = IYearnVault(_yToken);

        // Check fee status
        if (yBalanceBefore == 0) {
            // Balance is zero, initialize fee timestamp for future fee calculations
            ADMIN_VAULT.initializeFeeTimestamp(address(yToken));
        } else {
            // Balance is non-zero, take fees before depositing
            feeInTokens = _takeFee(address(yToken), _inputData.feeBasis);
        }

        yBalanceBefore = yToken.balanceOf(address(this));

        // Deposit tokens
        if (_inputData.amount != 0) {
            IERC20 underlyingToken = IERC20(yToken.token());
            if (_inputData.amount == type(uint256).max) {
                _inputData.amount = underlyingToken.balanceOf(address(this));
            }
            underlyingToken.approve(address(yToken), _inputData.amount);

            uint256 shares = yToken.deposit(_inputData.amount);
            if (shares < _inputData.minSharesReceived) {
                revert YearnSupply__InsufficientSharesReceived(shares, _inputData.minSharesReceived);
            }
        }

        yBalanceAfter = yToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    function protocolName() internal pure override returns (string memory) {
        return "Yearn";
    }
}
