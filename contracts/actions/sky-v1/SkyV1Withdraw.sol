// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title SkyV1Withdraw - Withdraws tokens from Sky (formerly MakerDAO/Spark) savings vault
/// @notice This contract allows users to withdraw tokens from a Sky vault (e.g., sUSDS)
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract SkyV1Withdraw is ERC4626Withdraw {
    /// @notice Initializes the SkyV1Withdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "SkyV1";
    }
}

