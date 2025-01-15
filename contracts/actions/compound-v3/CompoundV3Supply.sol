// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CompoundV3SupplyBase} from "../common/CompoundV3SupplyBase.sol";

/// @title CompoundV3Supply - Supplies tokens to Compound III market
/// @notice This contract allows users to supply tokens to a Compound III market
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CompoundV3Supply is CompoundV3SupplyBase {
    constructor(address _adminVault, address _logger) CompoundV3SupplyBase(_adminVault, _logger) {}

    /// @inheritdoc CompoundV3SupplyBase
    function protocolName() public pure override returns (string memory) {
        return "Compound V3";
    }
} 
