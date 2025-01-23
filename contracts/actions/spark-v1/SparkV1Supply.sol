// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title SparkV1Supply - Supplies DAI to Spark V1 (Sky) vault
/// @notice This contract allows users to supply DAI to a Spark V1 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract SparkV1Supply is ERC4626Supply {
    /// @notice Initializes the SparkV1Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "SparkV1";
    }
}
