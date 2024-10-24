// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";
import {IATokenV3} from "../../interfaces/aave-v3/IATokenV3.sol";

/// @title AaveV3Withdraw - Withdraws tokens from Aave lending pool
/// @notice This contract allows users to withdraw tokens from an Aave lending pool
/// @dev Inherits from ActionBase and implements the withdraw functionality for Aave protocol
/// @dev One difference to other actions is that there is a single pool address for all assets
/// @dev So we are using the assetId to get the specific aToken address
contract AaveV3Withdraw is ActionBase {
    /// @notice Instance of the Aave V3 lending pool
    /// @dev If the pool changes then we need to test and redeploy the contract
    IPool public immutable POOL;

    /// @notice Parameters for the withdraw action
    /// @param assetId ID of the asset to be withdrawn
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawAmount Amount of underlying token to withdraw
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 withdrawAmount;
    }

    /// @notice Initializes the AaveWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _poolAddress Address of the Aave lending pool contract
    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = IPool(_poolAddress);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address assetAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.assetId);

        // Execute action
        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _aaveWithdraw(inputData, assetAddress);

        // Log event
        LOGGER.logActionEvent(
            1,
            _encodeBalanceUpdate(_strategyId, inputData.assetId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @notice Withdraws all available tokens of a specific asset from the Aave lending pool
    /// @param _aTokenAddress Address of the aToken to withdraw
    function exit(address _aTokenAddress) public {
        IATokenV3 aToken = IATokenV3(_aTokenAddress);
        address underlyingAssetAddress = aToken.UNDERLYING_ASSET_ADDRESS();
        //verify the aToken is managed by this pool
        if (aToken.POOL() != address(POOL)) {
            revert Errors.Action_InvalidPool(protocolName(), actionType());
        }
        POOL.withdraw(underlyingAssetAddress, type(uint256).max, address(this));
    }

    /// @notice Calculates and takes fees, then withdraws the underlying token
    /// @param _inputData Struct containing withdraw parameters
    /// @param _aTokenAddress Address of the aToken to be withdrawn
    /// @return balanceBefore Balance of aTokens before the withdrawal
    /// @return balanceAfter Balance of aTokens after the withdrawal
    /// @return feeInTokens Amount of fees taken in tokens
    function _aaveWithdraw(
        Params memory _inputData,
        address _aTokenAddress
    ) private returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        uint256 amountToWithdraw = _inputData.withdrawAmount;
        if (amountToWithdraw == 0) {
            revert Errors.Action_ZeroAmount(protocolName(), actionType());
        }
        IATokenV3 aToken = IATokenV3(_aTokenAddress);
        address underlyingAssetAddress = aToken.UNDERLYING_ASSET_ADDRESS();
        balanceBefore = aToken.balanceOf(address(this));

        // Take any fees before doing any further actions
        feeInTokens = _takeFee(_aTokenAddress, _inputData.feeBasis);

        // If withdraw amount is non-zero, process the withdrawal
        if (amountToWithdraw > aToken.balanceOf(address(this))) {
            amountToWithdraw = type(uint256).max;
        }
        POOL.withdraw(underlyingAssetAddress, amountToWithdraw, address(this));
        balanceAfter = aToken.balanceOf(address(this));
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure override returns (string memory) {
        return "Aave";
    }
}
