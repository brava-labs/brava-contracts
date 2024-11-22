// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {CErc20Interface} from "../../interfaces/compound/CTokenInterfaces.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title CompoundV2SupplyBase - Base contract for Compound supply actions
/// @notice This contract provides base functionality for supplying to Compound-style lending pools
/// @dev To be inherited by specific Compound version implementations
abstract contract CompoundV2SupplyBase is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the supply action
    /// @param poolId The pool ID
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    ///  -----  Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address cTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // Execute action
        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _compoundSupply(inputData, cTokenAddress);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    function _compoundSupply(
        Params memory _inputData,
        address _cTokenAddress
    ) internal returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        // Get the asset instances
        address underlyingAssetAddress = _getUnderlyingAsset(_cTokenAddress);
        IERC20 underlyingAsset = IERC20(underlyingAssetAddress);
        IERC20 cToken = IERC20(_cTokenAddress);

        // For logging, get the balance before
        balanceBefore = cToken.balanceOf(address(this));

        feeInTokens = _processFee(_cTokenAddress, _inputData.feeBasis, _cTokenAddress, balanceBefore);

        // If we have an amount to deposit, do that
        if (_inputData.amount != 0) {
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingAsset.balanceOf(address(this))
                : _inputData.amount;

            require(amountToDeposit != 0, Errors.Action_ZeroAmount(protocolName(), actionType()));

            underlyingAsset.safeIncreaseAllowance(_cTokenAddress, amountToDeposit);
            uint256 result = CErc20Interface(_cTokenAddress).mint(amountToDeposit);
            require(result == 0, Errors.Action_CompoundError(protocolName(), actionType(), result));
        }

        // For logging, get the balance after
        balanceAfter = cToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    ///  -----  Protocol specific overrides -----  ///

    /// @notice Gets the underlying asset address for an cToken
    /// @param _cTokenAddress The cToken address
    function _getUnderlyingAsset(address _cTokenAddress) internal view virtual returns (address) {
        return CErc20Interface(_cTokenAddress).underlying();
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure virtual override returns (string memory);
}
