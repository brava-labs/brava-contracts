// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IERC4626} from "../../interfaces/ERC4626/IERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title VaultSupply - Supplies tokens to any ERC4626 vault
/// @notice This contract allows users to supply tokens to any ERC4626-compliant vault
/// @dev Inherits from ActionBase and implements generic supply functionality
contract VaultSupply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the supply action
    /// @param poolId ID of vault contract
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    /// @param minSharesReceived Minimum amount of shares to receive
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
    }

    /// @notice Initializes the VaultSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    /// @notice Executes the supply action
    /// @param _callData Encoded call data containing Params struct
    /// @param _strategyId ID of the strategy executing this action
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);
        address vault = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);

        // Execute action
        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _supplyToVault(inputData, vault);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Executes the vault supply logic
    /// @param _inputData Struct containing supply parameters
    /// @param _vaultAddress Address of the ERC4626 vault
    /// @return sharesBefore Balance of vault shares before the supply
    /// @return sharesAfter Balance of vault shares after the supply
    /// @return feeInTokens Amount of fees taken in tokens
    function _supplyToVault(
        Params memory _inputData,
        address _vaultAddress
    ) private returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        IERC4626 vault = IERC4626(_vaultAddress);
        sharesBefore = vault.balanceOf(address(this));

        // Handle fee initialization or collection
        if (sharesBefore == 0) {
            ADMIN_VAULT.initializeFeeTimestamp(_vaultAddress);
        } else {
            feeInTokens = _takeFee(_vaultAddress, _inputData.feeBasis);
        }

        // Perform the deposit
        if (_inputData.amount != 0) {
            IERC20 underlyingToken = IERC20(_getUnderlying(_vaultAddress));
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? underlyingToken.balanceOf(address(this))
                : _inputData.amount;

            if (amountToDeposit == 0) {
                revert Errors.Action_ZeroAmount(protocolName(), uint8(actionType()));
            }

            underlyingToken.safeIncreaseAllowance(_vaultAddress, amountToDeposit);
            uint256 shares = vault.deposit(amountToDeposit, address(this));
            if (shares < _inputData.minSharesReceived) {
                revert Errors.Action_InsufficientSharesReceived(
                    protocolName(),
                    actionType(),
                    shares,
                    _inputData.minSharesReceived
                );
            }
        }

        sharesAfter = vault.balanceOf(address(this));
    }

    /// @notice Gets the underlying token address from the vault
    /// @dev Override this for non-standard ERC4626 implementations
    /// @param _vaultAddress The vault address
    /// @return The underlying token address
    function _getUnderlying(address _vaultAddress) internal view virtual returns (address) {
        return IERC4626(_vaultAddress).asset();
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    /// @notice Returns the protocol name
    /// @return string Protocol name for the specific implementation
    function protocolName() internal pure virtual override returns (string memory) {
        return "ERC4626";
    }
}
