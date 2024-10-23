// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";
import {IATokenV3} from "../../interfaces/aave-v3/IATokenV3.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title AaveV3Supply - Supplies tokens to Aave lending pool
/// @notice This contract allows users to supply tokens to an Aave lending pool
/// @dev Inherits from ActionBase and implements the supply functionality for Aave protocol
/// @dev One difference to other actions is that there is a single pool address for all assets
/// @dev So we are using the assetId to get the specific aToken address
contract AaveV3Supply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Instance of the Aave V3 lending pool
    /// @dev If the pool changes then we need to test and redeploy the contract
    IPool public immutable POOL;

    /// @notice Parameters for the supply action
    /// @param poolId ID of Aave lending pool contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    /// @param asset Address of the asset to be supplied
    struct Params {
        bytes4 assetId;
        uint16 feeBasis;
        uint256 amount;
    }

    /// @notice Initializes the AaveSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _poolAddress Address of the Aave lending pool contract
    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = IPool(_poolAddress);
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
        // With AaveV3 there's only one pool, we need to know which asset we're working with
        address aTokenAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.assetId);

        // Execute action
        (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) = _aaveSupply(inputData, aTokenAddress);

        // Log event
        LOGGER.logActionEvent(
            1,
            _encodeBalanceUpdate(_strategyId, inputData.assetId, balanceBefore, balanceAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Executes the Aave supply logic
    /// @param _inputData Struct containing supply parameters
    /// @param _aTokenAddress Address of the aToken contract
    /// @return balanceBefore Balance of aTokens before the supply
    /// @return balanceAfter Balance of aTokens after the supply
    /// @return feeInTokens Amount of fees taken in tokens
    function _aaveSupply(
        Params memory _inputData,
        address _aTokenAddress
    ) private returns (uint256 balanceBefore, uint256 balanceAfter, uint256 feeInTokens) {
        // get the aToken and the underlying asset
        IATokenV3 aToken = IATokenV3(_aTokenAddress);
        address underlyingAssetAddress = aToken.UNDERLYING_ASSET_ADDRESS();
        IERC20 underlyingAsset = IERC20(underlyingAssetAddress);

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
            POOL.supply(underlyingAssetAddress, amountToDeposit, address(this), 0);
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
