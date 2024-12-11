// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ERC4626Withdraw} from "../common/ERC4626Withdraw.sol";
import {INotionalPToken} from "../../interfaces/notional/INotionalPToken.sol";
import {INotionalRouter} from "../../interfaces/notional/INotionalRouter.sol";

/// @title NotionalV3Withdraw - Withdraws tokens from Notional V3 vault
/// @notice This contract allows users to withdraw tokens from a Notional V3 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract NotionalV3Withdraw is ERC4626Withdraw {
    /// @notice Address of the Notional Router contract
    address public immutable NOTIONAL_ROUTER;

    /// @notice Initializes the NotionalWithdraw contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _notionalRouterAddress Address of the Notional Router contract
    constructor(
        address _adminVault,
        address _logger,
        address _notionalRouterAddress
    ) ERC4626Withdraw(_adminVault, _logger) {
        NOTIONAL_ROUTER = _notionalRouterAddress;
    }

    function _executeWithdraw(address _asset, uint256 _amount) internal override returns (uint256) {
        // Notional needs the currencyId, not the pToken address
        // We can get the currencyId from the pToken
        uint16 _currencyId = INotionalPToken(_asset).currencyId();
        return INotionalRouter(NOTIONAL_ROUTER).withdraw(_currencyId, uint88(_amount), true);
    }

    /// @inheritdoc ERC4626Withdraw
    /// @notice Returns the protocol name
    /// @return string "Fluid"
    function protocolName() public pure override returns (string memory) {
        return "NotionalV3";
    }
}
