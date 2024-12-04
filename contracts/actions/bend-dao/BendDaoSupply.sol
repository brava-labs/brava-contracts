// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";
import {AaveSupplyBase} from "../common/AaveSupply.sol";

/// @title BendDaoSupply - Supplies tokens to BendDAO v1
/// @notice This contract allows users to supply tokens to a BendDAO v1 lending pool
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract BendDaoSupply is AaveSupplyBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveSupplyBase(_adminVault, _logger, _poolAddress) {}

    function _supply(address _underlyingAsset, uint256 _amount) internal override {
        ILendingPool(POOL).deposit(_underlyingAsset, _amount, address(this), 0);
    }

    function protocolName() public pure override returns (string memory) {
        return "BendDaoV1";
    }
} 