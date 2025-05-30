// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";

/// @title UwULendV1Withdraw - Withdraws tokens from UwULendV1
/// @notice This contract allows users to withdraw tokens from a UwULendV1 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract UwULendV1Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() public pure override returns (string memory) {
        return "UwULendV1";
    }
}
