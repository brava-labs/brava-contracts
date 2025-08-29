// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {CompoundV2WithdrawBase} from "../common/CompoundV2Withdraw.sol";

/// @title StrikeV1Withdraw - Withdraws tokens from Strike V1 vault
/// @notice This contract allows users to withdraw tokens from a Strike V1 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract StrikeV1Withdraw is CompoundV2WithdrawBase {
    constructor(address _adminVault, address _logger) CompoundV2WithdrawBase(_adminVault, _logger) {}

    function protocolName() public pure override returns (string memory) {
        return "StrikeV1";
    }
}
