// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {IVesperPool} from "../../interfaces/vesper/IVesperPool.sol";

/// @title VesperWithdraw - Withdraws tokens from Vesper Pool
/// @notice This contract allows users to withdraw tokens from Vesper Pool
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract VesperWithdraw is ActionBase {
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

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        ADMIN_VAULT.checkFeeBasis(inputData.feeBasis);

        address poolAddress = ADMIN_VAULT.getPoolAddress(protocolName(), inputData.poolId);
        // Execute action
        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _withdrawLiquidity(inputData, poolAddress);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    function _withdrawLiquidity(
        Params memory _inputData,
        address _poolAddress
    ) internal returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        // Get the LP token address
        IVesperPool pool = IVesperPool(_poolAddress);

        // Get initial balance
        sharesBefore = IERC20(_poolAddress).balanceOf(address(this));

        feeInTokens = _processFee(_poolAddress, _inputData.feeBasis, _poolAddress, sharesBefore);

        // Get price per share once
        uint256 pricePerShare = pool.pricePerShare();
        
        uint256 underlyingBalance = (sharesBefore * pricePerShare) / 1e18;
        uint256 amountToWithdraw = _inputData.withdrawAmount >= underlyingBalance
            ? sharesBefore
            : (_inputData.withdrawAmount * 1e18) / pricePerShare;

        require(amountToWithdraw != 0, Errors.Action_ZeroAmount(protocolName(), actionType()));

        // Execute withdrawal
        pool.withdraw(amountToWithdraw);

        sharesAfter = IERC20(_poolAddress).balanceOf(address(this));
        // Calculate shares burned
        uint256 sharesBurned = sharesBefore - sharesAfter;
        require(
            sharesBurned <= _inputData.maxSharesBurned,
            Errors.Action_MaxSharesBurnedExceeded(
                protocolName(),
                uint8(actionType()),
                sharesBurned,
                _inputData.maxSharesBurned
            )
        );
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "Vesper";
    }
}
