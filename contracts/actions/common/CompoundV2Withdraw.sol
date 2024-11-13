// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CErc20Interface} from "../../interfaces/compound/CTokenInterfaces.sol";

/// @title CompoundV2WithdrawBase - Base contract for Compound withdraw actions
/// @notice This contract provides base functionality for withdrawing from Compound-style lending pools
/// @dev To be inherited by specific Compound version implementations
abstract contract CompoundV2WithdrawBase is ActionBase {

    /// @notice Parameters for the withdraw action
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 withdrawAmount;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) { }

    ///  -----  Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address cTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.assetId);

        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _compoundWithdraw(inputData, cTokenAddress);

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.assetId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    /// @notice Withdraws all of the underlying tokens from the aToken provided
    function exit(address _cTokenAddress) external {
        _withdraw(_cTokenAddress, type(uint256).max);
    }

    function _compoundWithdraw(
        Params memory _inputData,
        address _cTokenAddress
    ) internal returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        uint256 amountToWithdraw = _inputData.withdrawAmount;
        if (amountToWithdraw == 0) {
            revert Errors.Action_ZeroAmount(protocolName(), actionType());
        }

        address underlyingAsset = _getUnderlyingAsset(_cTokenAddress);
        balanceBefore = IERC20(_cTokenAddress).balanceOf(address(this));

        feeInTokens = _takeFee(_cTokenAddress, _inputData.feeBasis);

        if (amountToWithdraw > IERC20(_cTokenAddress).balanceOf(address(this))) {
            amountToWithdraw = type(uint256).max;
        }

        _withdraw(underlyingAsset, amountToWithdraw);
        balanceAfter = IERC20(_cTokenAddress).balanceOf(address(this));
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
    /// @param _amount Amount to withdraw
    function _withdraw(address _cTokenAddress, uint256 _amount) internal virtual {
        CErc20Interface(_cTokenAddress).redeem(_amount);
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure virtual override returns (string memory);
}
