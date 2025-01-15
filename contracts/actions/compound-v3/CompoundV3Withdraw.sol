// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CompoundV3WithdrawBase} from "../common/CompoundV3WithdrawBase.sol";

/// @title CompoundV3Withdraw - Withdraws tokens from Compound III market
/// @notice This contract allows users to withdraw base assets from a Compound III market
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CompoundV3Withdraw is CompoundV3WithdrawBase {
    constructor(address _adminVault, address _logger) CompoundV3WithdrawBase(_adminVault, _logger) {}

    /// @inheritdoc CompoundV3WithdrawBase
    function protocolName() public pure override returns (string memory) {
        return "Compound V3";
    }
} 