// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {CompoundV2SupplyBase} from "../common/CompoundV2Supply.sol";
contract StrikeSupply is CompoundV2SupplyBase {
    constructor(
        address _adminVault,
        address _logger
    ) CompoundV2SupplyBase(_adminVault, _logger) {}

    function protocolName() internal pure override returns (string memory) {
        return "Strike";
    }
}