// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";
import {IATokenV2} from "../../interfaces/aave-v2/IATokenV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AaveV2Supply - Supplies tokens to Aave V2 lending pool
/// @notice This contract allows users to supply tokens to an Aave V2 lending pool
/// @dev Inherits from ActionBase and implements the supply functionality for Aave V2 protocol
/// @dev One difference to other actions is that there is a single pool address for all assets
/// @dev So we are using the assetId to get the specific aToken address
contract AaveV2Supply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Instance of the Aave V2 lending pool
    /// @dev If the pool changes then we need to test and redeploy the contract
    ILendingPool public immutable POOL;

    /// @notice Parameters for the supply action
    /// @param assetId ID of the asset to be supplied
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 amount;
    }

    /// @notice Initializes the AaveV2Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _poolAddress Address of the Aave V2 lending pool contract
    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = ILendingPool(_poolAddress);
    }

    /// @inheritdoc ActionBase
    /// @notice Executes the supply action
    /// @param _callData Encoded call data containing Params struct
    /// @param _strategyId ID of the strategy executing this action
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

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Executes the Aave V2 supply logic
    /// @param _inputData Struct containing supply parameters
    /// @param _aTokenAddress Address of the aToken contract
    /// @return balanceBefore Balance of aTokens before the supply
    /// @return balanceAfter Balance of aTokens after the supply
    /// @return feeInTokens Amount of fees taken in tokens
    function _aaveSupply(
        Params memory _inputData,
        address _aTokenAddress
    ) private returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        IATokenV2 aToken = IATokenV2(_aTokenAddress);
        IERC20 underlyingAsset = IERC20(aToken.UNDERLYING_ASSET_ADDRESS());

        balanceBefore = aToken.balanceOf(address(this));

        // Handle fee initialization or collection
        if (balanceBefore == 0) {
            ADMIN_VAULT.initializeFeeTimestamp(_aTokenAddress);
        } else {
            feeInTokens = _takeFee(_aTokenAddress, _inputData.feeBasis);
        }

        // Perform the deposit
        if (_inputData.amount != 0) {
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingAsset.balanceOf(address(this))
                : _inputData.amount;

            if (amountToDeposit == 0) {
                // We wanted to input max, but have zero asset balance
                revert Errors.Action_ZeroAmount(protocolName(), actionType());
            }

            underlyingAsset.safeIncreaseAllowance(address(POOL), amountToDeposit);
            POOL.deposit(address(underlyingAsset), amountToDeposit, address(this), 0);
        }

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
