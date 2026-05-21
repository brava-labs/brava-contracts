// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {AaveSupplyBase} from "../common/AaveSupply.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";

/// @title SparkV1Supply - Supplies tokens to SparkLend (Aave V3 fork)
/// @notice This contract allows users to supply tokens to SparkLend pools
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract SparkV1Supply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger
    ) AaveSupplyBase(_adminVault, _logger) {}

    function _supply(address _underlyingAsset, uint256 _amount) internal override {
        IPool(_configAddress()).supply(_underlyingAsset, _amount, address(this), 0);
    }

    function protocolName() public pure override returns (string memory) {
        return "SparkV1";
    }
}
