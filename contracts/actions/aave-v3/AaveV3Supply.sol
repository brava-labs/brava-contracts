// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveSupplyBase} from "../common/AaveSupply.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";
import {IATokenV3} from "../../interfaces/aave-v3/IATokenV3.sol";

contract AaveV3Supply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveSupplyBase(_adminVault, _logger, _poolAddress) {}

    function _getUnderlyingAsset(address _aTokenAddress) internal view override returns (address) {
        return IATokenV3(_aTokenAddress).UNDERLYING_ASSET_ADDRESS();
    }

    function _supply(address _underlyingAsset, uint256 _amount) internal override {
        IPool(POOL).supply(_underlyingAsset, _amount, address(this), 0);
    }
}
