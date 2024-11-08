// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";
import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";
import {IATokenV2} from "../../interfaces/aave-v2/IATokenV2.sol";

contract AaveV2Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function _getATokenInfo(address _aTokenAddress) internal view override returns (address underlying, address pool) {
        IATokenV2 aToken = IATokenV2(_aTokenAddress);
        return (aToken.UNDERLYING_ASSET_ADDRESS(), aToken.POOL());
    }

    function _withdraw(address _underlyingAsset, uint256 _amount) internal override {
        ILendingPool(POOL).withdraw(_underlyingAsset, _amount, address(this));
    }
}
