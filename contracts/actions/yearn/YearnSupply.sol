// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title YearnSupply - Supplies tokens to Yearn vault
/// @notice This contract allows users to supply tokens to a Yearn vault
/// @dev Inherits from ActionBase and implements the supply functionality for Yearn protocol
contract YearnSupply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the supply action
    /// @param poolId ID of yToken vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    /// @param minSharesReceived Minimum amount of shares to receive
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
    }

    /// @notice Initializes the YearnSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    /// @notice Executes the supply action
    /// @param _callData Encoded call data containing Params struct
    /// @param _strategyId ID of the strategy executing this action
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);

        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address yToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) = _yearnSupply(inputData, yToken);

        LOGGER.logActionEvent(
            "BalanceUpdate",
            _encodeBalanceUpdate(_strategyId, inputData.poolId, yBalanceBefore, yBalanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
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
                revert Errors.Action_InsufficientSharesReceived(
                    protocolName(),
                    actionType(),
                    shares,
                    _inputData.minSharesReceived
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
