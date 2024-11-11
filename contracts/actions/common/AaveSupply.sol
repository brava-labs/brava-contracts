// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAaveToken} from "../../interfaces/common/IAaveToken.sol";

/// @title AaveSupplyBase - Base contract for Aave supply actions
/// @notice This contract provides base functionality for supplying to Aave-style lending pools
/// @dev To be inherited by specific Aave version implementations
abstract contract AaveSupplyBase is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Address of the Aave lending pool
    address public immutable POOL;

    /// @notice Parameters for the supply action
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 amount;
    }

    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = _poolAddress;
    }

    ///  -----  Core logic -----  ///

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address aTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.assetId);

        // Execute action
        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _aaveSupply(inputData, aTokenAddress);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.assetId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    function _aaveSupply(
        Params memory _inputData,
        address _aTokenAddress
    ) internal returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        // Get the asset instances
        address underlyingAssetAddress = _getUnderlyingAsset(_aTokenAddress);
        IERC20 underlyingAsset = IERC20(underlyingAssetAddress);
        IERC20 aToken = IERC20(_aTokenAddress);

        // For logging, get the balance before
        balanceBefore = aToken.balanceOf(address(this));

        // Handle fee initialization or collection
        if (balanceBefore == 0) {
            ADMIN_VAULT.initializeFeeTimestamp(_aTokenAddress);
        } else {
            feeInTokens = _takeFee(_aTokenAddress, _inputData.feeBasis);
        }

        // If we have an amount to deposit, do that
        if (_inputData.amount != 0) {
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingAsset.balanceOf(address(this))
                : _inputData.amount;

            if (amountToDeposit == 0) {
                // uh-oh, we have no tokens to deposit
                revert Errors.Action_ZeroAmount(protocolName(), actionType());
            }

            underlyingAsset.safeIncreaseAllowance(POOL, amountToDeposit);
            _supply(underlyingAssetAddress, amountToDeposit);
        }

        // For logging, get the balance after
        balanceAfter = aToken.balanceOf(address(this));
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    ///  -----  Protocol specific overrides -----  ///

    /// @notice Gets the underlying asset address for an aToken
    /// @param _aTokenAddress The aToken address
    function _getUnderlyingAsset(address _aTokenAddress) internal view virtual returns (address) {
        return IAaveToken(_aTokenAddress).UNDERLYING_ASSET_ADDRESS();
    }

    /// @notice Performs the actual supply to the Aave pool
    /// @param _underlyingAsset Address of the underlying asset
    /// @param _amount Amount to supply
    function _supply(address _underlyingAsset, uint256 _amount) internal virtual;

    /// @inheritdoc ActionBase
    function protocolName() internal pure virtual override returns (string memory);
}
