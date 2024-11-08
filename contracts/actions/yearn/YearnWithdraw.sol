// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ERC4626Withdraw} from "../ERC4626/ERC4626Withdraw.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

/// @title YearnWithdraw - Burns yTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a Yearn vault
/// @dev Inherits from ERC4626Withdraw and overrides withdraw functionality for Yearn protocol
contract YearnWithdraw is ERC4626Withdraw {
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function _executeWithdraw(
        address vault,
        uint256, // amount not
        uint256 maxShares
    ) internal virtual override returns (uint256 amountWithdrawn) {
        // Yearn's withdraw returns the amount of tokens withdrawn
        return IYearnVault(vault).withdraw(maxShares);
    }

    /// @inheritdoc ERC4626Withdraw
    function _getMaxWithdraw(address vault) internal view virtual override returns (uint256) {
        // For Yearn, we simply return the balance of shares we hold
        // as we can withdraw up to our full share balance (no limits or fees)
        return IYearnVault(vault).balanceOf(address(this));
    }

    /// @inheritdoc ERC4626Withdraw
    function protocolName() internal pure override returns (string memory) {
        return "Yearn";
    }
}
