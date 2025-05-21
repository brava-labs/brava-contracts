// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ShareBasedWithdraw} from "../common/ShareBasedWithdraw.sol";
import {IMaplePool} from "../../interfaces/maple/IMaplePool.sol";
import {IMaplePoolManager} from "../../interfaces/maple/IMaplePoolManager.sol";
import {IMapleWithdrawalManager} from "../../interfaces/maple/IMapleWithdrawalManager.sol";

/// @title MapleWithdrawQueue - Withdraws tokens from Maple Finance pools
/// @notice This contract handles the withdrawal process from Maple Finance pools
///         using Queue-based WithdrawalManager (FIFO order)
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
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
        
        // Get the withdrawal manager address from the pool
        address withdrawalManager = IMaplePoolManager(pool.manager()).withdrawalManager();
        
        // Get the next request ID which will be our request ID once submitted
        (uint256 requestId, ) = IMapleWithdrawalManager(withdrawalManager).queue();
        
        // Submit a withdrawal request for the specified number of shares
        pool.requestRedeem(_sharesToBurn, address(this));
        
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