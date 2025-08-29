// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title MapleSupply - Supplies tokens to Maple Finance pool
/// @notice This contract allows users to supply tokens to Maple Finance pools
/// @dev Inherits from ERC4626Supply for standard ERC4626 vault supply functionality
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract MapleSupply is ERC4626Supply {
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "MapleV1";
    }
} 