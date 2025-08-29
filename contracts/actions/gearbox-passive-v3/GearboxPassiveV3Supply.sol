// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title GearboxPassiveV3Supply - Supplies tokens to Gearbox Passive V3 vault
/// @notice This contract allows users to supply tokens to a Gearbox Passive V3 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract GearboxPassiveV3Supply is ERC4626Supply {
    /// @notice Initializes the GearboxPassiveV3Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @notice Returns the protocol name
    /// @return string "GearboxPassiveV3"
    function protocolName() public pure override returns (string memory) {
        return "GearboxPassiveV3";
    }
} 