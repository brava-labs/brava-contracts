// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";
import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title YearnWithdraw - Burns yTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a Yearn vault
/// @dev Inherits from ERC4626Withdraw and overrides withdraw functionality for Yearn protocol
contract YearnWithdraw is ERC4626Withdraw {
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @dev We are overriding because Yearn doesn't implement an Owner parameter for withdrawals, it's always the caller
    function _executeWithdraw(address vault, uint256 amount) internal virtual override returns (uint256 _sharesBurned) {
        _sharesBurned = IYearnVault(vault).withdraw(amount);
    }

    /// @inheritdoc ERC4626Withdraw
    /// @dev For yearn we can use the balance of shares as there's no fees or limits on withdrawals
    function _getMaxWithdraw(address vault) internal view virtual override returns (uint256) {
        return IYearnVault(vault).balanceOf(address(this));
    }

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "Yearn";
    }
}
