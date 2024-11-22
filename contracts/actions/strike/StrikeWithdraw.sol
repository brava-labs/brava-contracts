// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {CompoundV2WithdrawBase} from "../common/CompoundV2Withdraw.sol";

contract StrikeWithdraw is CompoundV2WithdrawBase {
    constructor(address _adminVault, address _logger) CompoundV2WithdrawBase(_adminVault, _logger) {}

    function protocolName() internal pure override returns (string memory) {
        return "Strike";
    }
}
