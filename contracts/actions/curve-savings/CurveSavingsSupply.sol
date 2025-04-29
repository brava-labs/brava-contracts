// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title CurveSavingsSupply - Supplies tokens to Curve Savings vault
/// @notice This contract allows users to supply tokens to a Curve Savings vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CurveSavingsSupply is ERC4626Supply {
    /// @notice Initializes the CurveSavingsSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @notice Returns the protocol name
    /// @return string "CurveSavings"
    function protocolName() public pure override returns (string memory) {
        return "CurveSavings";
    }
} 