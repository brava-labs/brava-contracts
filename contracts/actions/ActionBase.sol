// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {Errors} from "../Errors.sol";

/// @title ActionBase - Base contract for all actions in the protocol
/// @notice Implements common functionality and interfaces for all actions
/// @dev This contract should be inherited by all specific action contracts
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
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

    /// @notice Enum representing different types of logs
    // List of log types, this list should be updated with each new log type added to the system.
    //   Existing values should not be changed/removed, as they may be already in use by a deployed action.
    //   UNUSED keeps the enum starting at index 1 for off-chain processing.
    enum LogType {
        UNUSED,
        BALANCE_UPDATE,
        BUY_COVER,
        CURVE_3POOL_SWAP,
        PARASWAP_SWAP,
        SEND_TOKEN,
        PULL_TOKEN
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
    /// @param _strategyId The ID of the strategy executing this action (for logging use only)
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual;

    /// @notice Returns the type of action being implemented
    /// @return uint8 The action type as defined in the ActionType enum
    function actionType() public pure virtual returns (uint8);

    /// @notice Processes the fee taking, figures out if it's a supply and we need to initialize the fee timestamp
    /// @param _pool Address of the pool
    /// @param _feePercentage Fee percentage in basis points
    /// @param _feeToken Address of the fee token
    /// @param _shareBalance Balance of the shares in the pool
    /// @return feeInTokens The amount of fee taken
    /// @dev it's rare but in some cases the _pool does differ from the _feeToken
    function _processFee(
        address _pool,
        uint256 _feePercentage,
        address _feeToken,
        uint256 _shareBalance
    ) internal returns (uint256 feeInTokens) {
        if (actionType() == uint8(ActionType.DEPOSIT_ACTION) && _shareBalance == 0) {
            // If the share balance is zero, we need to initialize the fee timestamp
            ADMIN_VAULT.setFeeTimestamp(protocolName(), _pool);
            return 0;
        } else {
            // Otherwise, we take the fee
            uint256 lastFeeTimestamp = ADMIN_VAULT.getLastFeeTimestamp(protocolName(), _pool);
            require(lastFeeTimestamp != 0, Errors.AdminVault_NotInitialized());

            uint256 currentTimestamp = block.timestamp;
            if (lastFeeTimestamp == currentTimestamp) {
                return 0; // Don't take fees twice in the same block
            }

            IERC20 vault = IERC20(_feeToken);
            uint256 balance = vault.balanceOf(address(this));
            uint256 fee = _calculateFee(balance, _feePercentage, lastFeeTimestamp, currentTimestamp);
            vault.safeTransfer(ADMIN_VAULT.feeConfig().recipient, fee);
            ADMIN_VAULT.setFeeTimestamp(protocolName(), _pool);
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

    /// @notice Generates a pool ID from an address
    /// @param _addr Address to generate the pool ID from
    /// @return bytes4 The generated pool ID
    function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_addr)));
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
    function protocolName() public pure virtual returns (string memory);
}
