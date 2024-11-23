// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CompoundV2SupplyBase} from "../common/CompoundV2Supply.sol";

/// @title StrikeSupply - Supplies tokens to Strike vault
/// @notice This contract allows users to supply tokens to a Strike vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract StrikeSupply is CompoundV2SupplyBase {
    constructor(address _adminVault, address _logger) CompoundV2SupplyBase(_adminVault, _logger) {}

    function protocolName() public pure override returns (string memory) {
        return "Strike";
    }
}
