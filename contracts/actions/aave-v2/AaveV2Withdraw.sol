// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";
import {IATokenV2} from "../../interfaces/aave-v2/IATokenV2.sol";

/// @title AaveV2Withdraw - Withdraws tokens from Aave V2 lending pool
/// @notice This contract allows users to withdraw tokens from an Aave V2 lending pool
/// @dev Inherits from ActionBase and implements the withdraw functionality for Aave V2 protocol
/// @dev One difference to other actions is that there is a single pool address for all assets
/// @dev So we are using the assetId to get the specific aToken address
contract AaveV2Withdraw is ActionBase {
    /// @notice Instance of the Aave V2 lending pool
    /// @dev If the pool changes then we need to test and redeploy the contract
    ILendingPool public immutable POOL;

    /// @notice Parameters for the withdraw action
    /// @param assetId ID of the asset to be withdrawn
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawAmount Amount of underlying token to withdraw
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 withdrawAmount;
    }

    /// @notice Initializes the AaveV2Withdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _poolAddress Address of the Aave V2 lending pool contract
    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = ILendingPool(_poolAddress);
    }

    /// @inheritdoc ActionBase
    /// @notice Executes the withdraw action
    /// @param _callData Encoded call data containing Params struct
    /// @param _strategyId ID of the strategy executing this action
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address aTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.assetId);

        // Execute action
        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _aaveWithdraw(inputData, aTokenAddress);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.assetId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @notice Withdraws all of the underlying tokens from the aToken provided
    /// @param _aTokenAddress Address of the aToken to withdraw from
    function exit(address _aTokenAddress) external {
        IATokenV2 aToken = IATokenV2(_aTokenAddress);

        // Verify the aToken is managed by this pool
        if (aToken.POOL() != address(POOL)) {
            revert Errors.Action_InvalidPool(protocolName(), actionType());
        }

        // Withdraw the maximum available amount
        POOL.withdraw(aToken.UNDERLYING_ASSET_ADDRESS(), type(uint256).max, address(this));
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

        IATokenV2 aToken = IATokenV2(_aTokenAddress);
        address underlyingAssetAddress = aToken.UNDERLYING_ASSET_ADDRESS();

        balanceBefore = aToken.balanceOf(address(this));

        // Take any fees before performing the withdrawal
        feeInTokens = _takeFee(_aTokenAddress, _inputData.feeBasis);

        // If withdraw amount is greater than balance, set to max
        if (amountToWithdraw > aToken.balanceOf(address(this))) {
            amountToWithdraw = type(uint256).max;
        }

        // Perform the withdrawal
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
    /// @notice Returns the protocol name
    /// @return string "Aave"
    function protocolName() internal pure override returns (string memory) {
        return "Aave";
    }
}
