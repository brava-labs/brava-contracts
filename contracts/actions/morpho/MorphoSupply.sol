// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title MorphoSupply - Supplies tokens to Morpho vault
/// @notice This contract allows users to supply tokens to a Morpho vault
/// @dev Inherits from ERC4626Supply as Morpho implements ERC4626
contract MorphoSupply is ERC4626Supply {
    /// @notice Initializes the MorphoSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @notice Returns the protocol name
    /// @return string "Morpho"
    function protocolName() internal pure override returns (string memory) {
        return "Morpho";
    }
}
