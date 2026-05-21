// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IClearpoolPool} from "../../interfaces/clearpool-v1/IClearpoolPool.sol";
import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title ClearpoolV1Supply - Supplies tokens to Clearpool V1 pools
/// @notice This contract allows users to supply tokens to Clearpool V1 lending pools
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract ClearpoolV1Supply is ERC4626Supply {
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function _getUnderlying(address _poolAddress) internal view override returns (address) {
        return IClearpoolPool(_poolAddress).currency();
    }

    /// @inheritdoc ERC4626Supply
    function _getBalance(address _poolAddress) internal view override returns (uint256) {
        return IClearpoolPool(_poolAddress).balanceOf(address(this));
    }

    /// @inheritdoc ERC4626Supply
    function _deposit(address _poolAddress, uint256 _amount) internal override returns (uint256) {
        // we should return the shares gained, so check balance before and after
        uint256 balanceBefore = _getBalance(_poolAddress);
        IClearpoolPool(_poolAddress).provide(_amount);
        uint256 balanceAfter = _getBalance(_poolAddress);
        return balanceAfter - balanceBefore;
    }

    /// @inheritdoc ERC4626Supply
    /// @dev Clearpool uses maximumCapacity() and poolSize() to determine the remaining deposit capacity
    /// @dev However, if maximumCapacity is 0, then the pool has no limit on deposit capacity
    /// @param _poolAddress The pool address
    /// @return The maximum amount that can be deposited to the pool
    function _getMaxDeposit(address _poolAddress) internal view override returns (uint256) {
        uint256 maxCapacity = IClearpoolPool(_poolAddress).maximumCapacity();
        return maxCapacity == 0 
            ? type(uint256).max 
            : maxCapacity - IClearpoolPool(_poolAddress).poolSize();
    }

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "ClearpoolV1";
    }
}
