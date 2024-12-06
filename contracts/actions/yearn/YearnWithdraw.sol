// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title YearnWithdraw - Burns yTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a Yearn vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract YearnWithdraw is ERC4626Withdraw {

    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @dev We are overriding because Yearn doesn't implement an Owner parameter for withdrawals, it's always the caller
    function _executeWithdraw(address vault, uint256 amount) internal virtual override returns (uint256 _sharesBurned) {
        IYearnVault yVault = IYearnVault(vault);
        
        // Calculate shares using pricePerShare
        uint256 pricePerShare = yVault.pricePerShare();
        uint256 decimals = yVault.decimals();
        uint256 sharesToWithdraw = (amount * 10 ** decimals) / pricePerShare;
        
        // Add just 1 share to handle rounding
        sharesToWithdraw = sharesToWithdraw + 1;
        
        // Check our actual balance and cap withdrawal amount
        uint256 shareBalance = yVault.balanceOf(address(this));
        if (sharesToWithdraw > shareBalance) {
            sharesToWithdraw = shareBalance;
        }
        
        // Execute withdrawal with max loss of 1 BPS (0.01%)
        uint256 _tokensReceived = yVault.withdraw(sharesToWithdraw, address(this), 1);
        uint256 sharesAfter = yVault.balanceOf(address(this));
        _sharesBurned = shareBalance - sharesAfter;
    }

    /// @inheritdoc ERC4626Withdraw
    function _getMaxWithdraw(address vault) internal view virtual override returns (uint256) {
        IYearnVault yVault = IYearnVault(vault);
        
        uint256 shares = yVault.balanceOf(address(this));
        if (shares == 0) return 0;
        
        uint256 pricePerShare = yVault.pricePerShare();
        uint256 decimals = yVault.decimals();
        return (shares * pricePerShare) / 10 ** decimals;
    }

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "Yearn";
    }
}
