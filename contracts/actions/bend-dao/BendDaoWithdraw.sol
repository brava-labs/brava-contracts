// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";

/// @title BendDaoWithdraw - Withdraws tokens from BendDAO v1
/// @notice This contract allows users to withdraw tokens from a BendDAO v1 lending pool
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract BendDaoWithdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() public pure override returns (string memory) {
        return "BendDaoV1";
    }
} 