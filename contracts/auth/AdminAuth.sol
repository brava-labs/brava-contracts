// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {SafeERC20} from "../libraries/SafeERC20.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {AdminVault} from "./AdminVault.sol";

/// @title AdminAuth Handles owner/admin privileges over smart contracts
abstract contract AdminAuth {
    using SafeERC20 for IERC20;

    error SenderNotOwner();
    error SenderNotAdmin();
    error FeeTimestampNotInitialized();

    AdminVault public immutable ADMIN_VAULT;
    uint256 public immutable FEE_BASIS_POINTS;
    uint256 public immutable FEE_PERIOD;

    modifier onlyOwner() {
        if (ADMIN_VAULT.owner() != msg.sender) {
            revert SenderNotOwner();
        }
        _;
    }

    modifier onlyAdmin() {
        if (ADMIN_VAULT.admin() != msg.sender) {
            revert SenderNotAdmin();
        }
        _;
    }

    constructor(address _adminVault) {
        ADMIN_VAULT = AdminVault(_adminVault);
        FEE_BASIS_POINTS = 10000;
        FEE_PERIOD = 365 days;
    }

    /// @notice withdraw stuck funds
    function withdrawStuckFunds(address _token, address _receiver, uint256 _amount) public onlyOwner {
        if (_token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            payable(_receiver).transfer(_amount);
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }

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
            // TODO: Should we use a generic ERC4626 vault instead of generic ERC20?
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
    ) internal view returns (uint256) {
        uint256 secondsPassed = _currentTimestamp - _lastFeeTimestamp;

        // Calculate fee based on seconds passed, this is accurate enough
        // for the long term nature of the investements being dealt with here
        uint256 annualFee = (_totalDeposit * _feePercentage) / FEE_BASIS_POINTS;
        uint256 feeForPeriod = (annualFee * secondsPassed) / FEE_PERIOD;
        return feeForPeriod;
    }
}
