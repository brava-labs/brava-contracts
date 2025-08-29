// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title EulerV2Withdraw - Withdraws tokens from EulerV2 vault
/// @notice This contract allows users to withdraw tokens from an EulerV2 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract EulerV2Withdraw is ERC4626Withdraw {
    /// @notice Initializes the EulerV2Withdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    /// @notice Returns the protocol name
    /// @return string "EulerV2"
    function protocolName() public pure override returns (string memory) {
        return "EulerV2";
    }
}