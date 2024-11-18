// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveSupplyBase} from "../common/AaveSupply.sol";
import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";

contract UwULendSupply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveSupplyBase(_adminVault, _logger, _poolAddress) {}

    function _supply(address _underlyingAsset, uint256 _amount) internal override {
        ILendingPool(POOL).deposit(_underlyingAsset, _amount, address(this), 0);
    }

    function protocolName() internal pure override returns (string memory) {
        return "UwULend";
    }
}