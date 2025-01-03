// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IVesperPool} from "../../interfaces/vesper/IVesperPool.sol";
import {ERC4626Supply} from "../common/ERC4626Supply.sol";
/// @title VesperSupply - Supplies tokens to Vesper Pool
/// @notice This contract allows users to supply tokens to Vesper Pool
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract VesperSupply is ERC4626Supply {
    using SafeERC20 for IERC20;

    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    function _getUnderlying(address _poolAddress) internal view override returns (address) {
        return address(IVesperPool(_poolAddress).token());
    }

    function _deposit(address _poolAddress, uint256 _amount) internal override returns (uint256) {
        uint256 balanceBefore = IERC20(_poolAddress).balanceOf(address(this));
        IVesperPool(_poolAddress).deposit(_amount);
        uint256 balanceAfter = IERC20(_poolAddress).balanceOf(address(this));
        return balanceAfter - balanceBefore;
    }

    function _getMaxDeposit(address _poolAddress) internal view override returns (uint256) {
        return IERC20(_getUnderlying(_poolAddress)).balanceOf(address(this));
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "Vesper";
    }
}
