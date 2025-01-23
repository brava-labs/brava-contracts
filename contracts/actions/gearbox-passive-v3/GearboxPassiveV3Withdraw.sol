// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title GearboxPassiveV3Withdraw - Withdraws tokens from Gearbox Passive V3 vault
/// @notice This contract allows users to withdraw tokens from a Gearbox Passive V3 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract GearboxPassiveV3Withdraw is ERC4626Withdraw {
    /// @notice Initializes the GearboxPassiveV3Withdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @notice Returns the protocol name
    /// @return string "GearboxPassiveV3"
    function protocolName() public pure override returns (string memory) {
        return "GearboxPassiveV3";
    }
} 