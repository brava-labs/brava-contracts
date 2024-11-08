// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveSupplyBase} from "../common/AaveSupply.sol";
import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";
import {IATokenV2} from "../../interfaces/aave-v2/IATokenV2.sol";

contract AaveV2Supply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveSupplyBase(_adminVault, _logger, _poolAddress) {}

    function _getUnderlyingAsset(address _aTokenAddress) internal view override returns (address) {
        return IATokenV2(_aTokenAddress).UNDERLYING_ASSET_ADDRESS();
    }

    function _supply(address _underlyingAsset, uint256 _amount) internal override {
        ILendingPool(POOL).deposit(_underlyingAsset, _amount, address(this), 0);
    }
}
