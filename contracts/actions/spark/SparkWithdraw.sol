// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title SparkWithdraw - Withdraws DAI from Spark (Sky) vault
/// @notice This contract allows users to withdraw DAI from a Spark vault
/// @dev Inherits from ERC4626Withdraw as Spark implements ERC4626
contract SparkWithdraw is ERC4626Withdraw {
    /// @notice Initializes the SparkWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function protocolName() internal pure override returns (string memory) {
        return "Spark";
    }
}
