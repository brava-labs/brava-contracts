// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title SparkSupply - Supplies DAI to Spark (Sky) vault
/// @notice This contract allows users to supply DAI to a Spark vault
/// @dev Inherits from ERC4626Supply as Spark implements ERC4626
contract SparkSupply is ERC4626Supply {
    /// @notice Initializes the SparkSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function protocolName() internal pure override returns (string memory) {
        return "Spark";
    }
}
