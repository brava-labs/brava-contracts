// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../Errors.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ActionBase - Base contract for all actions in the protocol
/// @notice Implements common functionality and interfaces for all actions
/// @dev This contract should be inherited by all specific action contracts
abstract contract ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Interface for the admin vault
    IAdminVault public immutable ADMIN_VAULT;

    /// @notice Interface for the logger
    ILogger public immutable LOGGER;

    /// @notice Basis points for fee calculations (100% = 10000)
    uint256 public constant FEE_BASIS_POINTS = 10000;

    /// @notice Duration of a fee period (1 year)
    uint256 public constant FEE_PERIOD = 365 days;

    /// @notice Enum representing different types of actions
    enum ActionType {
        DEPOSIT_ACTION,
        WITHDRAW_ACTION,
        SWAP_ACTION,
        COVER_ACTION,
        FEE_ACTION,
        TRANSFER_ACTION,
        CUSTOM_ACTION
    }

    /// @notice Initializes the ActionBase contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) {
        ADMIN_VAULT = IAdminVault(_adminVault);
        LOGGER = ILogger(_logger);
    }

    /// @notice Executes the implemented action
    /// @dev This function should be overridden by inheriting contracts
    /// @param _callData Encoded input data for the action
    /// @param _strategyId The ID of the strategy executing this action
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual;

    /// @notice Returns the type of action being implemented
    /// @return uint8 The action type as defined in the ActionType enum
    function actionType() public pure virtual returns (uint8);

    /// @notice Takes the fee due from the vault and performs required updates
    /// @param _vault Address of the vault
    /// @param _feePercentage Fee percentage in basis points
    /// @return uint256 The amount of fee taken
    function _takeFee(address _vault, uint256 _feePercentage) internal returns (uint256) {
        uint256 lastFeeTimestamp = ADMIN_VAULT.getLastFeeTimestamp(_vault);
        uint256 currentTimestamp = block.timestamp;
        if (lastFeeTimestamp == 0) {
            revert Errors.AdminVault_NotInitialized();
        } else if (lastFeeTimestamp == currentTimestamp) {
            return 0; // Don't take fees twice in the same block
        } else {
            IERC20 vault = IERC20(_vault);
            uint256 balance = vault.balanceOf(address(this));
            uint256 fee = _calculateFee(balance, _feePercentage, lastFeeTimestamp, currentTimestamp);
            vault.safeTransfer(ADMIN_VAULT.feeConfig().recipient, fee);
            ADMIN_VAULT.updateFeeTimestamp(_vault);
            return fee;
        }
    }

    /// @notice Calculates the fee due from the vault
    /// @param _totalDeposit Total amount deposited in the vault
    /// @param _feePercentage Fee percentage in basis points
    /// @param _lastFeeTimestamp Timestamp of the last fee collection
    /// @param _currentTimestamp Current timestamp
    /// @return uint256 The calculated fee amount
    function _calculateFee(
        uint256 _totalDeposit,
        uint256 _feePercentage,
        uint256 _lastFeeTimestamp,
        uint256 _currentTimestamp
    ) internal pure returns (uint256) {
        uint256 secondsPassed = _currentTimestamp - _lastFeeTimestamp;
        uint256 annualFee = (_totalDeposit * _feePercentage) / FEE_BASIS_POINTS;
        uint256 feeForPeriod = (annualFee * secondsPassed) / FEE_PERIOD;
        return feeForPeriod;
    }

    /// @notice Encodes balance update information
    /// @param _strategyId ID of the strategy
    /// @param _poolId ID of the pool
    /// @param _balanceBefore Balance before the action
    /// @param _balanceAfter Balance after the action
    /// @param _feeInTokens Amount of fee taken in tokens
    /// @return bytes Encoded balance update information
    function _encodeBalanceUpdate(
        uint16 _strategyId,
        bytes4 _poolId,
        uint256 _balanceBefore,
        uint256 _balanceAfter,
        uint256 _feeInTokens
    ) internal pure returns (bytes memory) {
        return abi.encode(_strategyId, _poolId, _balanceBefore, _balanceAfter, _feeInTokens);
    }

    /// @notice Returns the name of the protocol
    /// @return string The name of the protocol
    function protocolName() internal pure virtual returns (string memory);
}
