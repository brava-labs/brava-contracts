// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {IContractRegistry} from "../interfaces/IContractRegistry.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// TODOs for each actions
// private parsing function for each action
// improve logging with indexer in mind
// utilize ContractRegistry for all actions (?)
// do we go with fixed version or ^0.8.0

/// @title Implements Action interface and common helpers for passing inputs
abstract contract ActionBase {
    using SafeERC20 for IERC20;

    IAdminVault public immutable ADMIN_VAULT;
    IContractRegistry public immutable REGISTRY;
    ILogger public immutable LOGGER;

    error FeeTimestampNotInitialized();

    uint256 public constant FEE_BASIS_POINTS = 10000;
    uint256 public constant FEE_PERIOD = 365 days;

    enum ActionType {
        DEPOSIT_ACTION,
        WITHDRAW_ACTION,
        SWAP_ACTION,
        COVER_ACTION,
        FEE_ACTION,
        TRANSFER_ACTION,
        CUSTOM_ACTION
    }

    constructor(address _adminVault, address _registry, address _logger) {
        ADMIN_VAULT = IAdminVault(_adminVault);
        REGISTRY = IContractRegistry(_registry);
        LOGGER = ILogger(_logger);
    }

    /// @notice Parses inputs and runs the implemented action through a user wallet
    /// @dev Is called by the RecipeExecutor chaining actions together
    /// @param _callData Array of input values each value encoded as bytes
    /// @param _strategyId The index of the strategy the action is related to
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual;

    /// @notice Returns the type of action we are implementing
    function actionType() public pure virtual returns (uint8);

    /// Helper functions

    /// @notice If necessary, takes the fee due from the vault and performs required updates
    function _takeFee(address _vault, uint256 _feePercentage) internal returns (uint256) {
        uint256 lastFeeTimestamp = ADMIN_VAULT.getLastFeeTimestamp(_vault);
        uint256 currentTimestamp = block.timestamp;
        if (lastFeeTimestamp == 0) {
            // Ensure the fee timestamp is initialized
            revert FeeTimestampNotInitialized();
        } else if (lastFeeTimestamp == currentTimestamp) {
            // Don't take fees twice in the same block
            return 0;
        } else {
            IERC20 vault = IERC20(_vault);
            uint256 balance = vault.balanceOf(address(this));
            uint256 fee = _calculateFee(balance, _feePercentage, lastFeeTimestamp, currentTimestamp);
            vault.safeTransfer(ADMIN_VAULT.feeRecipient(), fee);
            ADMIN_VAULT.updateFeeTimestamp(_vault);
            return fee;
        }
    }

    /// @notice Calculates the fee due from the vault based on the balance and fee percentage
    function _calculateFee(
        uint256 _totalDeposit,
        uint256 _feePercentage,
        uint256 _lastFeeTimestamp,
        uint256 _currentTimestamp
    ) internal pure returns (uint256) {
        uint256 secondsPassed = _currentTimestamp - _lastFeeTimestamp;

        // Calculate fee based on seconds passed, this is accurate enough
        // for the long term nature of the investements being dealt with here
        uint256 annualFee = (_totalDeposit * _feePercentage) / FEE_BASIS_POINTS;
        uint256 feeForPeriod = (annualFee * secondsPassed) / FEE_PERIOD;
        return feeForPeriod;
    }

    function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_addr)));
    }

    function _encodeBalanceUpdate(
        uint16 _strategyId,
        bytes4 _poolId,
        uint256 _balanceBefore,
        uint256 _balanceAfter,
        uint256 _feeInTokens
    ) internal pure returns (bytes memory) {
        return abi.encode(_strategyId, _poolId, _balanceBefore, _balanceAfter, _feeInTokens);
    }
}
