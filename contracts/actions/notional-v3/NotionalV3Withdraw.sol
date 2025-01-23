// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ShareBasedWithdraw} from "../common/ShareBasedWithdraw.sol";
import {INotionalPToken} from "../../interfaces/notional-v3/INotionalPToken.sol";
import {INotionalRouter} from "../../interfaces/notional-v3/INotionalRouter.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";

/// @title NotionalV3Withdraw - Withdraws tokens from Notional V3 vault
/// @notice This contract allows users to withdraw tokens from a Notional V3 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract NotionalV3Withdraw is ShareBasedWithdraw {
    using SafeERC20 for IERC20;

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
    ) ShareBasedWithdraw(_adminVault, _logger) {
        NOTIONAL_ROUTER = _notionalRouterAddress;
    }

    function _executeWithdraw(
        address _asset,
        uint256 _sharesToBurn,
        uint256 _minUnderlyingReceived
    ) internal override {
        INotionalPToken pToken = INotionalPToken(_asset);
        uint16 _currencyId = pToken.currencyId();
        
        IERC20(_asset).safeIncreaseAllowance(NOTIONAL_ROUTER, _sharesToBurn);
        
        uint256 underlyingReceived = INotionalRouter(NOTIONAL_ROUTER).withdraw(_currencyId, uint88(_sharesToBurn), true);
        require(
            underlyingReceived >= _minUnderlyingReceived,
            Errors.Action_UnderlyingReceivedLessThanExpected(underlyingReceived, _minUnderlyingReceived)
        );
    }

    /// @dev Returns the current balance of shares
    function _getBalance(address _vaultAddress) internal view override returns (uint256) {
        return INotionalPToken(_vaultAddress).balanceOf(address(this));
    }

    /// @inheritdoc ShareBasedWithdraw
    /// @notice Returns the protocol name
    /// @return string "NotionalV3"
    function protocolName() public pure override returns (string memory) {
        return "NotionalV3";
    }
}
