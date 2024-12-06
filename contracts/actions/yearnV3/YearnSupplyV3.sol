// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IYearnVaultV3} from "../../interfaces/yearnV3/IYearnVaultV3.sol";
import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title ERC4626Supply - Supplies tokens to Yearn V3 vault
/// @notice This contract allows users to supply tokens to a Yearn V3 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract YearnSupplyV3 is ERC4626Supply {
    /// @notice Initializes the YearnSupplyV3 contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "YearnV3";
    }
} 