// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";
import {IATokenV3} from "../../interfaces/aave-v3/IATokenV3.sol";

contract AaveV3Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function _getATokenInfo(address _aTokenAddress) internal view override returns (address underlying, address pool) {
        IATokenV3 aToken = IATokenV3(_aTokenAddress);
        return (aToken.UNDERLYING_ASSET_ADDRESS(), aToken.POOL());
    }

    function _withdraw(address _underlyingAsset, uint256 _amount) internal override {
        IPool(POOL).withdraw(_underlyingAsset, _amount, address(this));
    }
}
