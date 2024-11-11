// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAaveToken} from "../../interfaces/common/IAaveToken.sol";
import {IAavePool} from "../../interfaces/common/IAavePool.sol";

/// @title AaveWithdrawBase - Base contract for Aave withdraw actions
/// @notice This contract provides base functionality for withdrawing from Aave-style lending pools
/// @dev To be inherited by specific Aave version implementations
abstract contract AaveWithdrawBase is ActionBase {
    /// @notice Address of the Aave lending pool
    address public immutable POOL;

    /// @notice Parameters for the withdraw action
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 withdrawAmount;
    }

    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = _poolAddress;
    }

    ///  -----  Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory inputData = _parseInputs(_callData);
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address aTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.assetId);

        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _aaveWithdraw(inputData, aTokenAddress);

        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.assetId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    /// @notice Withdraws all of the underlying tokens from the aToken provided
    function exit(address _aTokenAddress) external {
        address underlyingAsset = _getUnderlyingAsset(_aTokenAddress);
        _withdraw(underlyingAsset, type(uint256).max);
    }

    function _aaveWithdraw(
        Params memory _inputData,
        address _aTokenAddress
    ) internal returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        uint256 amountToWithdraw = _inputData.withdrawAmount;
        if (amountToWithdraw == 0) {
            revert Errors.Action_ZeroAmount(protocolName(), actionType());
        }

        address underlyingAsset = _getUnderlyingAsset(_aTokenAddress);
        balanceBefore = IERC20(_aTokenAddress).balanceOf(address(this));

        feeInTokens = _takeFee(_aTokenAddress, _inputData.feeBasis);

        if (amountToWithdraw > IERC20(_aTokenAddress).balanceOf(address(this))) {
            amountToWithdraw = type(uint256).max;
        }

        _withdraw(underlyingAsset, amountToWithdraw);
        balanceAfter = IERC20(_aTokenAddress).balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    ///  -----  Protocol specific overrides -----  ///

    /// @notice Gets the underlying asset address for an aToken
    /// @param _aTokenAddress The aToken address
    /// @return underlying The underlying asset address
    function _getUnderlyingAsset(address _aTokenAddress) internal view virtual returns (address underlying) {
        underlying = IAaveToken(_aTokenAddress).UNDERLYING_ASSET_ADDRESS();
    }

    /// @notice Performs the actual withdrawal from the Aave pool
    /// @param _underlyingAsset Address of the underlying asset
    /// @param _amount Amount to withdraw
    function _withdraw(address _underlyingAsset, uint256 _amount) internal virtual {
        IAavePool(POOL).withdraw(_underlyingAsset, _amount, address(this));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure virtual override returns (string memory);
}