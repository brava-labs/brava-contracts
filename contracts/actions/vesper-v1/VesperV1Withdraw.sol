// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ShareBasedWithdraw} from "../common/ShareBasedWithdraw.sol";
import {IVesperPool} from "../../interfaces/vesper-v1/IVesperPool.sol";

/// @title VesperV1Withdraw - Withdraws tokens from VesperV1 Pool
/// @notice This contract allows users to withdraw tokens from VesperV1 Pool
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract VesperV1Withdraw is ShareBasedWithdraw {
    using SafeERC20 for IERC20;

    constructor(address _adminVault, address _logger) ShareBasedWithdraw(_adminVault, _logger) {}

    function _executeWithdraw(
        address _vaultAddress,
        uint256 _sharesToBurn,
        uint256 _minUnderlyingReceived
    ) internal override {
        IVesperPool pool = IVesperPool(_vaultAddress);
        IERC20 underlyingToken = IERC20(pool.token());

        // Get underlying balance before withdrawal
        uint256 balanceBefore = underlyingToken.balanceOf(address(this));

        // Execute withdrawal
        pool.withdraw(_sharesToBurn);

        // Calculate actual underlying received
        uint256 underlyingReceived = underlyingToken.balanceOf(address(this)) - balanceBefore;
        require(
            underlyingReceived >= _minUnderlyingReceived,
            Errors.Action_UnderlyingReceivedLessThanExpected(underlyingReceived, _minUnderlyingReceived)
        );
    }

    function _getBalance(address _vaultAddress) internal view override returns (uint256) {
        return IERC20(_vaultAddress).balanceOf(address(this));
    }

    /// @inheritdoc ShareBasedWithdraw
    function protocolName() public pure override returns (string memory) {
        return "VesperV1";
    }
}
