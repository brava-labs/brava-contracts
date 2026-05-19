// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC4626} from "../../interfaces/common/IERC4626.sol";
import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title MorphoVaultV2Withdraw - Withdraws tokens from a Morpho Vault V2
/// @notice Morpho Vault V2 is ERC4626-compliant but maxWithdraw() always returns 0,
///         so this override computes the withdrawable amount from shares.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract MorphoVaultV2Withdraw is ERC4626Withdraw {
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @dev Morpho Vault V2 returns 0 from maxWithdraw(); derive from share balance instead.
    function _getMaxWithdraw(address _vaultAddress) internal view override returns (uint256) {
        IERC4626 vault = IERC4626(_vaultAddress);
        uint256 shares = vault.balanceOf(address(this));
        return vault.convertToAssets(shares);
    }

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "MorphoVaultV2";
    }
}
