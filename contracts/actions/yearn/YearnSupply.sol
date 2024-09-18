// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {ActionUtils} from "../../libraries/ActionUtils.sol";
import {AdminAuth} from "../../auth/AdminAuth.sol";

/// @title Supplies tokens to Yearn vault
/// @dev tokens need to be approved for user's wallet to pull them (token address)
contract YearnSupply is ActionBase, AdminAuth {
    using TokenUtils for address;

    // TODO: Implement unified error reporting for all actions.
    error YearnSupply__InsufficientSharesReceived(uint256 sharesReceived, uint256 minSharesReceived);

    /// @param yToken - address of yToken vault contract
    /// @param amount - amount of underlying token to supply
    /// @param feeBasis - fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param minSharesReceived - minimum amount of shares to receive
    struct Params {
        address yToken;
        uint256 amount;
        uint256 feeBasis;
        uint256 minSharesReceived;
    }

    constructor(
        address _registry,
        address _logger,
        address _adminVault
    ) ActionBase(_registry, _logger) AdminAuth(_adminVault) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual override {
        // parse input data
        Params memory inputData = _parseInputs(_callData);

        // verify input data
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        // TODO: Verify the yToken is a whitelisted contract

        // execute logic
        (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) = _yearnSupply(inputData);

        // log event
        LOGGER.logActionEvent(
            "BalanceUpdate",
            ActionUtils._encodeBalanceUpdate(
                _strategyId,
                ActionUtils._poolIdFromAddress(inputData.yToken),
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

    function _yearnSupply(Params memory _inputData) private returns (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) {
        IYearnVault yToken = IYearnVault(_inputData.yToken);

        // Check fee status
        if (yBalanceBefore == 0) {
            // Balance is zero, initialize fee timestamp for future fee calculations
            ADMIN_VAULT.initializeFeeTimestamp(address(yToken));
        } else {
            // Balance is non-zero, take fees before depositing
            feeInTokens = _takeFee(address(yToken), _inputData.feeBasis);
        }

        yBalanceBefore = address(yToken).getBalance(address(this));

        // Deposit tokens
        if (_inputData.amount != 0) {
            address underlyingToken = yToken.token();
            if (_inputData.amount == type(uint256).max) {
                _inputData.amount = underlyingToken.getBalance(address(this));
            }
            underlyingToken.approveToken(address(yToken), _inputData.amount);

            uint256 shares = yToken.deposit(_inputData.amount);
            if (shares < _inputData.minSharesReceived) {
                revert YearnSupply__InsufficientSharesReceived(shares, _inputData.minSharesReceived);
            }
        }

        yBalanceAfter = address(yToken).getBalance(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
