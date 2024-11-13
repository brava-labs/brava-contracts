// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";
import {IClearpoolPool} from "../../interfaces/clearpool/IClearpoolPool.sol";

/// @title ClearpoolSupply - Supplies tokens to Clearpool pools
/// @notice This contract allows users to supply tokens to Clearpool lending pools
/// @dev Inherits from ERC4626Supply and adapts Clearpool's interface
contract ClearpoolSupply is ERC4626Supply {
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
    function protocolName() internal pure override returns (string memory) {
        return "Clearpool";
    }
}
