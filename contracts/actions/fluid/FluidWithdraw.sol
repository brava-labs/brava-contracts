// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title FluidWithdraw - Withdraws tokens from Fluid vault
/// @notice This contract allows users to withdraw tokens from a Fluid vault
/// @dev Inherits from VaultWithdraw as Fluid implements ERC4626
contract FluidWithdraw is ERC4626Withdraw {
    /// @notice Initializes the FluidWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @notice Returns the protocol name
    /// @return string "Fluid"
    function protocolName() internal pure override returns (string memory) {
        return "Fluid";
    }
}
