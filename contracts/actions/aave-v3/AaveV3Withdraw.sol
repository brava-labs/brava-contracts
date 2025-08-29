// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";

/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract AaveV3Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() public pure override returns (string memory) {
        return "AaveV3";
    }
}
