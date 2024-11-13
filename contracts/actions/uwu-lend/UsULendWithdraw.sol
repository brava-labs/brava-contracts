// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";

contract UwULendWithdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() internal pure override returns (string memory) {
        return "UwULend";
    }
}
