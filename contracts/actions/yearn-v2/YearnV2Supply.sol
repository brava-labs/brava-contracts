// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IYearnVault} from "../../interfaces/yearn-v2/IYearnVault.sol";
import {ERC4626Supply} from "../common/ERC4626Supply.sol";

/// @title ERC4626Supply - Supplies tokens to YearnV2 vault
/// @notice This contract allows users to supply tokens to a YearnV2 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract YearnV2Supply is ERC4626Supply {
    /// @notice Initializes the YearnV2Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ERC4626Supply(_adminVault, _logger) {}

    /// @inheritdoc ERC4626Supply
    /// @dev YearnV2 uses token() instead of ERC4626's asset()
    function _getUnderlying(address _vaultAddress) internal view override returns (address) {
        return IYearnVault(_vaultAddress).token();
    }

    /// @inheritdoc ERC4626Supply
    /// @dev YearnV2 uses availableDepositLimit() to determine the remaining deposit capacity
    /// @param _vaultAddress The vault address
    /// @return The maximum amount that can be deposited to the vault
    function _getMaxDeposit(address _vaultAddress) internal view override returns (uint256) {
        return IYearnVault(_vaultAddress).availableDepositLimit();
    }

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "YearnV2";
    }
}
