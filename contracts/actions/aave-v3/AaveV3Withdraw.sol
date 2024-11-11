// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {AaveWithdrawBase} from "../common/AaveWithdraw.sol";
import {IPool} from "../../interfaces/aave-v3/IPoolInstance.sol";
import {IATokenV3} from "../../interfaces/aave-v3/IATokenV3.sol";

contract AaveV3Withdraw is AaveWithdrawBase {
    constructor(
        address _adminVault,
        address _logger,
        address _poolAddress
    ) AaveWithdrawBase(_adminVault, _logger, _poolAddress) {}

    function protocolName() internal pure override returns (string memory) {
        return "AaveV3";
    }
}
