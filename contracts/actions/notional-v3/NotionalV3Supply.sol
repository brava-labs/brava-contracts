// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {ERC4626Supply} from "../common/ERC4626Supply.sol";
import {INotionalRouter} from "../../interfaces/notional-v3/INotionalRouter.sol";
import {INotionalPToken} from "../../interfaces/notional-v3/INotionalPToken.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title NotionalV3Supply - Supplies tokens into Notional V3 vaults
/// @notice This contract allows users to supply tokens into Notional V3 vaults
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract NotionalV3Supply is ERC4626Supply {
    using SafeERC20 for IERC20;

    /// @notice Address of the Notional V3 Router contract
    address public immutable NOTIONAL_ROUTER;

    /// @notice Initializes the NotionalV3Supply contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _notionalRouter Address of the Notional Router contract
    constructor(address _adminVault, address _logger, address _notionalRouter) ERC4626Supply(_adminVault, _logger) {
        NOTIONAL_ROUTER = _notionalRouter;
    }

    /// @inheritdoc ERC4626Supply
    function _deposit(address _asset, uint256 _amount) internal override returns (uint256) {
        // Notional needs the currencyId, not the pToken address
        // We can get the currencyId from the pToken
        uint16 _currencyId = INotionalPToken(_asset).currencyId();
        return INotionalRouter(NOTIONAL_ROUTER).depositUnderlyingToken(address(this), _currencyId, _amount);
    }

    function _increaseAllowance(address _underlying, address, uint256 _amount) internal override {
        // Notional needs the allowance to the router, not the pToken
        IERC20(_underlying).safeIncreaseAllowance(NOTIONAL_ROUTER, _amount);
    }

    /// @inheritdoc ERC4626Supply
    function protocolName() public pure override returns (string memory) {
        return "NotionalV3";
    }
}
