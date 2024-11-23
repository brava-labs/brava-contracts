// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CompoundV2WithdrawBase} from "../common/CompoundV2Withdraw.sol";

/// @title StrikeWithdraw - Withdraws tokens from Strike vault
/// @notice This contract allows users to withdraw tokens from a Strike vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract StrikeWithdraw is CompoundV2WithdrawBase {
    constructor(address _adminVault, address _logger) CompoundV2WithdrawBase(_adminVault, _logger) {}

    function protocolName() public pure override returns (string memory) {
        return "Strike";
    }
}
