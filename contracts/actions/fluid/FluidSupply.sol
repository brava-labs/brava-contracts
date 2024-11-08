// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {VaultSupply} from "../common/ERC4626Supply.sol";

/// @title FluidSupply - Supplies tokens to Fluid vault
/// @notice This contract allows users to supply tokens to a Fluid vault
/// @dev Inherits from VaultSupply as Fluid implements ERC4626
contract FluidSupply is VaultSupply {
    /// @notice Initializes the FluidSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) VaultSupply(_adminVault, _logger) {}

    /// @inheritdoc VaultSupply
    /// @notice Returns the protocol name
    /// @return string "Fluid"
    function protocolName() internal pure override returns (string memory) {
        return "Fluid";
    }
}
