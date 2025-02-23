// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../../Errors.sol";
import {CErc20Interface, CTokenInterface} from "../../interfaces/compound/CTokenInterfaces.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title CompoundV2WithdrawBase - Base contract for Compound withdraw actions
/// @notice This contract provides base functionality for withdrawing from Compound-style lending pools
/// @dev To be inherited by specific Compound version implementations
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
abstract contract CompoundV2WithdrawBase is ActionBase {
    /// @notice Parameters for the withdraw action
    /// @param poolId The pool ID
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawAmount Amount of underlying token to withdraw
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 withdrawAmount;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    ///  -----  Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address cTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _compoundWithdraw(
            inputData,
            cTokenAddress
        );

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    function _compoundWithdraw(
        Params memory _inputData,
        address _cTokenAddress
    ) internal returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        uint256 amountToWithdraw = _inputData.withdrawAmount;
        balanceBefore = CTokenInterface(_cTokenAddress).balanceOf(address(this));

        feeInTokens = _processFee(_cTokenAddress, _inputData.feeBasis, _cTokenAddress);

        uint256 underlyingBalance = _getBalance(_cTokenAddress);
        if (amountToWithdraw > underlyingBalance) {
            amountToWithdraw = underlyingBalance;
        }
        require(amountToWithdraw != 0, Errors.Action_ZeroAmount(protocolName(), actionType()));

        _withdraw(_cTokenAddress, amountToWithdraw);
        balanceAfter = CTokenInterface(_cTokenAddress).balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    ///  -----  Protocol specific overrides -----  ///

    /// @notice Gets the underlying asset address for an cToken
    /// @param _cTokenAddress The cToken address
    /// @return underlying The underlying asset address
    function _getUnderlyingAsset(address _cTokenAddress) internal view virtual returns (address underlying) {
        underlying = CErc20Interface(_cTokenAddress).underlying();
    }

    /// @notice Performs the actual withdrawal from the Compound pool
    /// @param _cTokenAddress The cToken address
    /// @param _amount Amount to withdraw in underlying tokens
    function _withdraw(address _cTokenAddress, uint256 _amount) internal virtual {
        uint256 result = CErc20Interface(_cTokenAddress).redeemUnderlying(_amount);
        require(result == 0, Errors.Action_CompoundError(protocolName(), actionType(), result));
    }

    /// @dev Override for non-standard balance calculations
    function _getBalance(address _cTokenAddress) internal virtual returns (uint256) {
        return CTokenInterface(_cTokenAddress).balanceOfUnderlying(address(this));
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure virtual override returns (string memory);
}
