// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ShareBasedWithdraw} from "../common/ShareBasedWithdraw.sol";
import {IMaplePool} from "../../interfaces/maple/IMaplePool.sol";
import {IMaplePoolManager} from "../../interfaces/maple/IMaplePoolManager.sol";
import {IMapleWithdrawalManager} from "../../interfaces/maple/IMapleWithdrawalManager.sol";

/// @title MapleWithdrawQueue - Withdraws tokens from Maple Finance pools
/// @notice This contract handles the withdrawal process from Maple Finance pools
///         using Queue-based WithdrawalManager (FIFO order)
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract MapleWithdrawQueue is ShareBasedWithdraw {
    constructor(address _adminVault, address _logger) ShareBasedWithdraw(_adminVault, _logger) {}

    /**
     * @notice Executes a withdrawal from a Maple Finance pool using the queue-based withdrawal system
     * @dev Maple's requestRedeem submits a withdrawal request to their queue system.
     *      The withdrawal is not immediate and will be processed by Maple's pool delegate later.
     *      Maple requires each request to be processed before submitting new ones.
     *      Attempting multiple requests without processing will be rejected.
     * @param _vaultAddress The address of the Maple pool
     * @param _sharesToBurn The number of shares to withdraw
     * @dev _minUnderlyingReceived is not used in this action due to the async nature of the withdrawal
     */
    function _executeWithdraw(
        address _vaultAddress,
        uint256 _sharesToBurn,
        uint256 /* _minUnderlyingReceived */
    ) internal override {
        IMaplePool pool = IMaplePool(_vaultAddress);

        address withdrawalManager = IMaplePoolManager(pool.manager()).withdrawalManager();

        // Submit the withdrawal request. Maple escrows the shares and appends the
        // request to its FIFO queue; the underlying assets are released later when
        // Maple's pool delegate processes the queue.
        pool.requestRedeem(_sharesToBurn, address(this));

        // The request just submitted is the newest entry in the queue, so the
        // queue's lastRequestId identifies it.
        (, uint256 requestId) = IMapleWithdrawalManager(withdrawalManager).queue();

        LOGGER.logActionEvent(
            LogType.WITHDRAWAL_REQUEST,
            abi.encode(_vaultAddress, _sharesToBurn, requestId)
        );
    }

    function _getBalance(address _vaultAddress) internal view override returns (uint256) {
        return IMaplePool(_vaultAddress).balanceOf(address(this));
    }
    
    /// @inheritdoc ShareBasedWithdraw
    function protocolName() public pure override returns (string memory) {
        return "MapleV1";
    }
} 