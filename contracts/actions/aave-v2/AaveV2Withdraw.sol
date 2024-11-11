// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";
import {ILendingPool} from "../../interfaces/aave-v2/ILendingPool.sol";
import {IATokenV2} from "../../interfaces/aave-v2/IATokenV2.sol";

contract AaveV2Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() internal pure override returns (string memory) {
        return "AaveV2";
    }
}
