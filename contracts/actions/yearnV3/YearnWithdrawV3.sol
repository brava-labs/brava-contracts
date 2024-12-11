// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IYearnVaultV3} from "../../interfaces/yearnV3/IYearnVaultV3.sol";
import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";

/// @title YearnWithdrawV3 - Burns yTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a Yearn V3 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract YearnWithdrawV3 is ERC4626Withdraw {
    constructor(address _adminVault, address _logger) ERC4626Withdraw(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Withdraw
    function protocolName() public pure override returns (string memory) {
        return "YearnV3";
    }
}
