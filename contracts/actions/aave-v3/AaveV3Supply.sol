// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AaveSupplyBase} from "../common/AaveSupply.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";

/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract AaveV3Supply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveSupplyBase(_adminVault, _logger, _poolAddress) {}

    function _supply(address _underlyingAsset, uint256 _amount) internal override {
        IPool(POOL).supply(_underlyingAsset, _amount, address(this), 0);
    }

    function protocolName() public pure override returns (string memory) {
        return "AaveV3";
    }
}
