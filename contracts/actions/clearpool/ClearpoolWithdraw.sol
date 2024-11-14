// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";
import {IClearpoolPool} from "../../interfaces/clearpool/IClearpoolPool.sol";

/// @title ClearpoolWithdraw - Withdraws tokens from Clearpool pools
/// @notice This contract allows users to withdraw tokens from Clearpool lending pools
/// @dev Inherits from ERC4626Withdraw and adapts Clearpool's interface
contract ClearpoolWithdraw is ERC4626Withdraw {
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function _executeWithdraw(address _vaultAddress, uint256 amount) internal override returns (uint256 sharesBurned) {
        // Get shares before
        uint256 sharesBefore = IClearpoolPool(_vaultAddress).balanceOf(address(this));

        // Use redeemCurrency which takes amount in underlying
        IClearpoolPool(_vaultAddress).redeemCurrency(amount);

        // Calculate shares burned
        return sharesBefore - IClearpoolPool(_vaultAddress).balanceOf(address(this));
    }

    function exit(address _vaultAddress) external override {
        IClearpoolPool(_vaultAddress).redeem(IClearpoolPool(_vaultAddress).balanceOf(address(this)));
    }

    /// @inheritdoc ERC4626Withdraw
    function _getBalance(address _vaultAddress) internal view override returns (uint256) {
        return IClearpoolPool(_vaultAddress).balanceOf(address(this));
    }

    /// @inheritdoc ERC4626Withdraw
    function _getMaxWithdraw(address _vaultAddress) internal view override returns (uint256) {
        uint256 shares = IClearpoolPool(_vaultAddress).balanceOf(address(this));
        if (shares == 0) return 0;

        uint256 exchangeRate = IClearpoolPool(_vaultAddress).getCurrentExchangeRate();
        // Convert our shares to underlying (shares * exchangeRate / 1e18)
        uint256 rounding = ((shares * exchangeRate) / 1e18) == 0 ? 0 : 1;
        uint256 maxFromShares = ((shares * exchangeRate) / 1e18) + rounding;
        // Also check pool's available liquidity
        uint256 poolLiquidity = IClearpoolPool(_vaultAddress).availableToWithdraw();
        // Return the minimum of our potential withdrawal and pool's available liquidity
        return maxFromShares < poolLiquidity ? maxFromShares : poolLiquidity;
    }

    /// @inheritdoc ERC4626Withdraw
    function protocolName() internal pure override returns (string memory) {
        return "Clearpool";
    }
}
