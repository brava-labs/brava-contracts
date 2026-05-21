// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title SkyV1Supply - Supplies tokens to Sky (formerly MakerDAO/Spark) savings vault
/// @notice This contract allows users to supply tokens to a Sky vault (e.g., sUSDS)
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract SkyV1Supply is ERC4626Supply {
    /// @notice Initializes the SkyV1Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "SkyV1";
    }
}

