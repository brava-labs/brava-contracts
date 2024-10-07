// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IFluidLending} from "../../interfaces/fluid/IFToken.sol";

/// @title FluidWithdraw - Burns fTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a Fluid vault
/// @dev Inherits from ActionBase and implements the withdraw functionality for Fluid protocol
contract FluidWithdraw is ActionBase {
    /// @notice Parameters for the withdraw action
    /// @param poolId ID of fToken vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawRequest Amount of underlying token to withdraw
    /// @param maxSharesBurned Maximum amount of fTokens to burn
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 withdrawRequest;
        uint256 maxSharesBurned;
    }

    /// @notice Initializes the FluidWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);

        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address fToken = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) = _fluidWithdraw(inputData, fToken);

        LOGGER.logActionEvent(
            "BalanceUpdate",
            _encodeBalanceUpdate(_strategyId, inputData.poolId, fBalanceBefore, fBalanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @notice Withdraws all available tokens from the specified Fluid vault
    /// @param _fToken Address of the fToken contract
    function exit(address _fToken) public {
        IFluidLending fToken = IFluidLending(_fToken);
        uint256 maxWithdrawAmount = fToken.maxWithdraw(address(this));
        fToken.withdraw(maxWithdrawAmount, address(this), address(this));
    }

    /// @notice Calculates and takes fees, then withdraws the underlying token
    /// @param _inputData Struct containing withdraw parameters
    /// @param _fToken Address of the fToken contract
    /// @return fBalanceBefore Balance of fTokens before the withdrawal
    /// @return fBalanceAfter Balance of fTokens after the withdrawal
    /// @return feeInTokens Amount of fees taken in tokens
    function _fluidWithdraw(
        Params memory _inputData,
        address _fToken
    ) private returns (uint256 fBalanceBefore, uint256 fBalanceAfter, uint256 feeInTokens) {
        IFluidLending fToken = IFluidLending(_fToken);

        fBalanceBefore = fToken.balanceOf(address(this));

        // Take any fees before doing any further actions
        feeInTokens = _takeFee(address(fToken), _inputData.feeBasis);

        // If withdraw request is non-zero, process the withdrawal
        if (_inputData.withdrawRequest != 0) {
            uint256 maxWithdrawAmount = fToken.maxWithdraw(address(this));
            uint256 amountToWithdraw = _inputData.withdrawRequest > maxWithdrawAmount
                ? maxWithdrawAmount
                : _inputData.withdrawRequest;

            if (amountToWithdraw == 0) {
                revert Errors.Action_ZeroAmount(protocolName(), actionType());
            }
            fToken.withdraw(amountToWithdraw, address(this), address(this), _inputData.maxSharesBurned);
        }
        fBalanceAfter = fToken.balanceOf(address(this));
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure override returns (string memory) {
        return "Fluid";
    }
}
