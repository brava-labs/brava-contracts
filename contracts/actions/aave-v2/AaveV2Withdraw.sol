// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";

/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract AaveV2Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger
    ) AaveWithdrawBase(_adminVault, _logger) {}

    function protocolName() public pure override returns (string memory) {
        return "AaveV2";
    }
}
