// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title SparkV1Withdraw - Withdraws DAI from Spark V1 (Sky) vault
/// @notice This contract allows users to withdraw DAI from a Spark V1 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract SparkV1Withdraw is ERC4626Withdraw {
    /// @notice Initializes the SparkV1Withdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "SparkV1";
    }
}
