// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";

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
