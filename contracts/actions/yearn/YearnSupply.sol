// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {VaultSupply} from "../ERC4626/ERC4626Supply.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

/// @title YearnSupply - Supplies tokens to Yearn vault
/// @notice This contract allows users to supply tokens to a Yearn vault
/// @dev Inherits from VaultSupply and overrides _getUnderlying for Yearn's non-standard ERC4626 implementation
contract YearnSupply is VaultSupply {
    /// @notice Initializes the YearnSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) VaultSupply(_adminVault, _logger) {}

    /// @inheritdoc VaultSupply
    /// @dev Yearn uses token() instead of ERC4626's asset()
    function _getUnderlying(address _vaultAddress) internal view override returns (address) {
        return IYearnVault(_vaultAddress).token();
    }

    /// @inheritdoc VaultSupply
    function protocolName() internal pure override returns (string memory) {
        return "Yearn";
    }
}
