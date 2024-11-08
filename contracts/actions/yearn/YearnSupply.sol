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
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address yToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // Execute action
        (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) = _yearnSupply(inputData, yToken);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, yBalanceBefore, yBalanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Executes the Fluid supply logic
    /// @param _inputData Struct containing supply parameters
    /// @param _yTokenAddress Address of the fToken contract
    /// @return yBalanceBefore Balance of fTokens before the supply
    /// @return yBalanceAfter Balance of fTokens after the supply
    /// @return feeInTokens Amount of fees taken in tokens
    function _yearnSupply(
        Params memory _inputData,
        address _yTokenAddress
    ) private returns (uint256 yBalanceBefore, uint256 yBalanceAfter, uint256 feeInTokens) {
        IYearnVault yToken = IYearnVault(_yTokenAddress);
        yBalanceBefore = yToken.balanceOf(address(this));

        // Handle fee initialization or collection
        if (yBalanceBefore == 0) {
            ADMIN_VAULT.initializeFeeTimestamp(address(yToken));
        } else {
            feeInTokens = _takeFee(address(yToken), _inputData.feeBasis);
        }

        // Perform the deposit
        if (_inputData.amount != 0) {
            IERC20 underlyingToken = IERC20(yToken.token());
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingToken.balanceOf(address(this))
                : _inputData.amount;

            if (amountToDeposit == 0) {
                // We wanted to input max, but have zero stable balance
                revert Errors.Action_ZeroAmount(protocolName(), uint8(actionType()));
            }

            underlyingToken.safeIncreaseAllowance(_yTokenAddress, amountToDeposit);
            uint256 shares = yToken.deposit(_inputData.amount, address(this));
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
    /// @notice Returns the protocol name
    /// @return string "Fluid"
    function protocolName() internal pure override returns (string memory) {
        return "Yearn";
    }
}
