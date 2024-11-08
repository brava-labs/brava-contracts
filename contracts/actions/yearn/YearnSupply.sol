// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";
import {IYearnVault} from "../../interfaces/yearn/IYearnVault.sol";

/// @title ERC4626Supply - Supplies tokens to Yearn vault
/// @notice This contract allows users to supply tokens to a Yearn vault
/// @dev Inherits from VaultSupply and overrides _getUnderlying for Yearn's non-standard ERC4626 implementation
contract YearnSupply is ERC4626Supply {
    /// @notice Initializes the YearnSupply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @dev Yearn uses token() instead of ERC4626's asset()
    function _getUnderlying(address _vaultAddress) internal view override returns (address) {
        return IYearnVault(_vaultAddress).token();
    }

    /// @inheritdoc ERC4626Supply
    function protocolName() internal pure override returns (string memory) {
        return "Yearn";
    }
}
