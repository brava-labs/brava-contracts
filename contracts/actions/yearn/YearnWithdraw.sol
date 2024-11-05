// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

/// @title YearnWithdraw - Burns yTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a Yearn vault
/// @dev Inherits from ActionBase and implements the withdraw functionality for Yearn protocol
contract YearnWithdraw is ActionBase {
    /// @notice Parameters for the withdraw action
    /// @param poolId ID of yToken vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawRequest Amount of underlying token to withdraw
    /// @param maxSharesBurned Maximum amount of yTokens to burn
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 withdrawRequest;
        uint256 maxSharesBurned;
    }

    /// @notice Initializes the YearnWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address yToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // Execute action
        (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) = _yearnWithdraw(inputData, yToken);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, yBalanceBefore, yBalanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @notice Withdraws all available tokens from the specified Yearn vault
    /// @param _yToken Address of the yToken contract
    function exit(address _yToken) public {
        IYearnVault yToken = IYearnVault(_yToken);
        yToken.withdraw();
    }

    /// @notice Calculates and takes fees, then withdraws the underlying token
    /// @param _inputData Struct containing withdraw parameters
    /// @param _yToken Address of the yToken contract
    /// @return yBalanceBefore Balance of yTokens before the withdrawal
    /// @return yBalanceAfter Balance of yTokens after the withdrawal
    /// @return feeInTokens Amount of fees taken in tokens
    function _yearnWithdraw(
        Params memory _inputData,
        address _yToken
    ) private returns (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) {
        IYearnVault yToken = IYearnVault(_yToken);

        // Take any fees before doing any further actions
        feeInTokens = _takeFee(address(yToken), _inputData.feeBasis);

        yBalanceBefore = yToken.balanceOf(address(this));

        // If withdraw request is non-zero, process the withdrawal
        if (_inputData.withdrawRequest != 0) {
            uint256 pricePerShare = yToken.pricePerShare();
            uint256 maxWithdrawAmount = yBalanceBefore * pricePerShare;
            uint256 sharesBurned;

            if (_inputData.withdrawRequest > maxWithdrawAmount) {
                sharesBurned = yToken.withdraw();
            } else {
                sharesBurned = yToken.withdraw(_inputData.withdrawRequest, address(this));
            }

            if (sharesBurned > _inputData.maxSharesBurned) {
                revert Errors.Action_MaxSharesBurnedExceeded(
                    protocolName(),
                    actionType(),
                    sharesBurned,
                    _inputData.maxSharesBurned
                );
            }
        }

        yBalanceAfter = yToken.balanceOf(address(this));
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure override returns (string memory) {
        return "Yearn";
    }
}
