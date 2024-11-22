// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title FluidSupply - Supplies tokens to Fluid vault
/// @notice This contract allows users to supply tokens to a Fluid vault
/// @dev Inherits from ERC4626Supply as Fluid implements ERC4626
contract FluidSupply is ERC4626Supply {
    /// @notice Initializes the FluidSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @notice Returns the protocol name
    /// @return string "Fluid"
    function protocolName() public pure override returns (string memory) {
        return "Fluid";
    }
}
