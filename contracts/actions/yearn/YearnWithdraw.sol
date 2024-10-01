// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

/// @title Burns yTokens and receive underlying tokens in return
/// @dev yTokens need to be approved for user's wallet to pull them (yToken address)
contract YearnWithdraw is ActionBase {
    // TODO: Implement unified error reporting for all actions.
    error YearnWithdraw__MaxSharesBurnedExceeded();

    /// @param yToken - address of yToken vault contract
    /// @param amount - amount of underlying token to withdraw
    /// @param feeBasis - fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param maxSharesBurned - maximum amount of yTokens to burn
    struct Params {
        address yToken;
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
        // TODO: Verify the yToken is a whitelisted contract

        // execute logic
        (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) = _yearnWithdraw(inputData);

        // log event
        LOGGER.logActionEvent(
            "BalanceUpdate",
            _encodeBalanceUpdate(
                _strategyId,
                _poolIdFromAddress(inputData.yToken),
                yBalanceBefore,
                yBalanceAfter,
                feeInTokens
            )
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    function exit(address _yToken) public {
        IYearnVault yToken = IYearnVault(_yToken);
        yToken.withdraw();
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// Calculate and take fees, then withdraw the underlying token
    function _yearnWithdraw(
        Params memory _inputData
    ) private returns (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) {
        IYearnVault yToken = IYearnVault(_inputData.yToken);

        // Take any fees before doing any further actions
        feeInTokens = _takeFee(address(yToken), _inputData.feeBasis);

        yBalanceBefore = yToken.balanceOf(address(this));

        // If withdraw request is zero this was only a fee take, so we can skip the rest
        if (_inputData.withdrawRequest != 0) {
            // If withdraw exceeds balance, withdraw max
            uint256 pricePerShare = yToken.pricePerShare();
            uint256 maxWithdrawAmount = yBalanceBefore * pricePerShare;
            if (_inputData.withdrawRequest > maxWithdrawAmount) {
                if (yToken.withdraw() > _inputData.maxSharesBurned) {
                    revert YearnWithdraw__MaxSharesBurnedExceeded();
                }
            } else {
                if (yToken.withdraw(_inputData.withdrawRequest, address(this)) > _inputData.maxSharesBurned) {
                    revert YearnWithdraw__MaxSharesBurnedExceeded();
                }
            }
        }
        yBalanceAfter = yToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
