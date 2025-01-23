// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title MorphoV1Supply - Supplies tokens to Morpho V1 vault
/// @notice This contract allows users to supply tokens to a Morpho V1 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract MorphoV1Supply is ERC4626Supply {
    /// @notice Initializes the MorphoV1Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @notice Returns the protocol name
    /// @return string "MorphoV1"
    function protocolName() public pure override returns (string memory) {
        return "MorphoV1";
    }
}
