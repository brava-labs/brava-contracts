// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IYearnVault} from "../../interfaces/yearn-v2/IYearnVault.sol";
import {ShareBasedWithdraw} from "../common/ShareBasedWithdraw.sol";
import {Errors} from "../../Errors.sol";

/// @title YearnV2Withdraw - Burns yTokens and receives underlying tokens in return
/// @notice This contract allows users to withdraw tokens from a YearnV2 vault
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract YearnV2Withdraw is ShareBasedWithdraw {
    constructor(address _adminVault, address _logger) ShareBasedWithdraw(_adminVault, _logger) {}

    function _executeWithdraw(
        address _vaultAddress,
        uint256 _sharesToBurn,
        uint256 _minUnderlyingReceived
    ) internal override {
        IYearnVault yVault = IYearnVault(_vaultAddress);

        // Execute withdrawal with max loss of 1 BPS (0.01%)
        uint256 underlyingReceived = yVault.withdraw(_sharesToBurn, address(this), 1);
        require(
            underlyingReceived >= _minUnderlyingReceived,
            Errors.Action_UnderlyingReceivedLessThanExpected(underlyingReceived, _minUnderlyingReceived)
        );
    }

    function _getBalance(address _vaultAddress) internal view override returns (uint256) {
        return IYearnVault(_vaultAddress).balanceOf(address(this));
    }

    /// @inheritdoc ShareBasedWithdraw
    function protocolName() public pure override returns (string memory) {
        return "YearnV2";
    }
}
