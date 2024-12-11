// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AaveSupplyBase} from "../common/AaveSupply.sol";

/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract AaveV2Supply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveSupplyBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() public pure override returns (string memory) {
        return "AaveV2";
    }
}
