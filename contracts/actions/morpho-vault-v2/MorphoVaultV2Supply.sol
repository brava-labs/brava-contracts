// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title MorphoVaultV2Supply - Supplies tokens to a Morpho Vault V2
/// @notice Morpho Vault V2 is ERC4626-compliant but maxDeposit() always returns 0,
///         so this override removes the deposit cap entirely.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract MorphoVaultV2Supply is ERC4626Supply {
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @dev Morpho Vault V2 returns 0 from maxDeposit(); deposits are uncapped in practice.
    function _getMaxDeposit(address) internal pure override returns (uint256) {
        return type(uint256).max;
    }

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "MorphoVaultV2";
    }
}
