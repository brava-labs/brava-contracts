// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CompoundV2SupplyBase} from "../common/CompoundV2Supply.sol";

/// @title StrikeV1Supply - Supplies tokens to Strike V1 vault
/// @notice This contract allows users to supply tokens to a Strike V1 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract StrikeV1Supply is CompoundV2SupplyBase {
    constructor(address _adminVault, address _logger) CompoundV2SupplyBase(_adminVault, _logger) {}

    function protocolName() public pure override returns (string memory) {
        return "StrikeV1";
    }
}
