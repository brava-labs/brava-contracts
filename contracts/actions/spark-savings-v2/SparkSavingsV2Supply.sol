// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title SparkSavingsV2Supply - Supplies tokens to a Spark Savings vault
/// @notice This contract allows users to supply tokens to a Spark Savings vault (e.g., Spark Savings USDC / USDT)
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract SparkSavingsV2Supply is ERC4626Supply {
    /// @notice Initializes the SparkSavingsV2Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "SparkSavingsV2";
    }
}
