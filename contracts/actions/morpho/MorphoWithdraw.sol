// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title MorphoWithdraw - Withdraws tokens from Morpho vault
/// @notice This contract allows users to withdraw tokens from a Morpho vault
/// @dev Inherits from VaultWithdraw as Morpho implements ERC4626
contract MorphoWithdraw is ERC4626Withdraw {
    /// @notice Initializes the MorphoWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @notice Returns the protocol name
    /// @return string "Morpho"
    function protocolName() internal pure override returns (string memory) {
        return "Morpho";
    }
}
