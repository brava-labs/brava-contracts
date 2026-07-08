// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title SparkSavingsV2Withdraw - Withdraws tokens from a Spark Savings vault
/// @notice This contract allows users to withdraw tokens from a Spark Savings vault (e.g., Spark Savings USDC / USDT)
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract SparkSavingsV2Withdraw is ERC4626Withdraw {
    /// @notice Initializes the SparkSavingsV2Withdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "SparkSavingsV2";
    }
}
