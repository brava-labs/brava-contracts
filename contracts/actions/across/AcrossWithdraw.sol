// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {HubPoolInterface} from "../../interfaces/across/HubPoolInterface.sol";

/// @title AcrossWithdraw - Withdraws tokens from Across Protocol HubPool
/// @notice This contract allows users to withdraw tokens from Across Protocol's HubPool
contract AcrossWithdraw is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the withdraw action
    /// @param poolId The pool ID
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param withdrawAmount Amount of liquidity to withdraw in underlying token
    /// @param maxSharesBurned Maximum number of shares to burn
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 withdrawAmount;
        uint256 maxSharesBurned;
    }

    HubPoolInterface public immutable ACROSS_HUB;

    constructor(address _adminVault, address _logger, address _acrossHub) ActionBase(_adminVault, _logger) {
        ACROSS_HUB = HubPoolInterface(_acrossHub);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);

        // Execute action
        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _withdrawLiquidity(inputData);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    function _withdrawLiquidity(
        Params memory _inputData
    ) internal returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        address l1Token = ADMIN_VAULT.getPoolAddress(protocolName(), _inputData.poolId);
        // Get the LP token address
        HubPoolInterface.PooledToken memory pooledToken = ACROSS_HUB.pooledTokens(l1Token);
        address lpToken = pooledToken.lpToken;

        // Get initial balance
        sharesBefore = IERC20(lpToken).balanceOf(address(this));

        feeInTokens = _processFee(l1Token, _inputData.feeBasis, lpToken, sharesBefore);

        uint256 underlyingBalance = _sharesToUnderlying(sharesBefore, l1Token);
        /// @dev If the withdraw amount is greater or equal than the underlying balance, we withdraw the entire balance
        /// @dev Otherwise, some dust might be left behind
        uint256 amountToWithdraw = _inputData.withdrawAmount >= underlyingBalance 
            ? sharesBefore
            : _underlyingToShares(_inputData.withdrawAmount, l1Token);

        if (amountToWithdraw == 0) {
            revert Errors.Action_ZeroAmount(protocolName(), actionType());
        }

        // Get LP balance before withdrawal for share calculation
        uint256 lpBalanceBefore = IERC20(lpToken).balanceOf(address(this));

        // Execute withdrawal
        ACROSS_HUB.removeLiquidity(l1Token, amountToWithdraw, false);

        sharesAfter = IERC20(lpToken).balanceOf(address(this));
        // Calculate shares burned
        uint256 sharesBurned = lpBalanceBefore - sharesAfter;
        if (sharesBurned > _inputData.maxSharesBurned) {
            revert Errors.Action_MaxSharesBurnedExceeded(
                protocolName(),
                uint8(actionType()),
                sharesBurned,
                _inputData.maxSharesBurned
            );
        }
    }

    function _sharesToUnderlying(uint256 _shares, address _l1Token) internal returns (uint256) {
        return _shares * ACROSS_HUB.exchangeRateCurrent(_l1Token) / 1e18;
    }

    function _underlyingToShares(uint256 _underlying, address _l1Token) internal returns (uint256) {
        return _underlying * 1e18 / ACROSS_HUB.exchangeRateCurrent(_l1Token);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure override returns (string memory) {
        return "Across";
    }
}