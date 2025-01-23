// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {HubPoolInterface} from "../../interfaces/across-v3/HubPoolInterface.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title AcrossV3Supply - Supplies tokens to Across Protocol HubPool
/// @notice This contract allows users to supply tokens to Across Protocol's HubPool
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract AcrossV3Supply is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the supply action
    /// @param poolId The pool ID
    /// @param feeBasis Fee percentage to apply (in basis points, e.g., 100 = 1%)
    /// @param amount Amount of underlying token to supply
    /// @param minSharesReceived Minimum number of shares to receive
    struct Params {
        bytes4 poolId;
        uint16 feeBasis;
        uint256 amount;
        uint256 minSharesReceived;
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
        (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) = _supplyToPool(inputData);

        // Log event
        LOGGER.logActionEvent(
            LogType.BALANCE_UPDATE,
            _encodeBalanceUpdate(_strategyId, inputData.poolId, sharesBefore, sharesAfter, feeInTokens)
        );
    }

    function _supplyToPool(
        Params memory _inputData
    ) internal returns (uint256 sharesBefore, uint256 sharesAfter, uint256 feeInTokens) {
        address l1Token = ADMIN_VAULT.getPoolAddress(protocolName(), _inputData.poolId);
        // Get the LP token address
        HubPoolInterface.PooledToken memory pooledToken = ACROSS_HUB.pooledTokens(l1Token);
        address lpToken = pooledToken.lpToken;

        // Get initial balance
        sharesBefore = IERC20(lpToken).balanceOf(address(this));

        feeInTokens = _processFee(l1Token, _inputData.feeBasis, lpToken);

        // If we have an amount to deposit, do that
        if (_inputData.amount != 0) {
            uint256 amountToDeposit = _inputData.amount == type(uint256).max
                ? IERC20(l1Token).balanceOf(address(this))
                : _inputData.amount;

            require(amountToDeposit != 0, Errors.Action_ZeroAmount(protocolName(), actionType()));

            // Approve and supply
            IERC20(l1Token).safeIncreaseAllowance(address(ACROSS_HUB), amountToDeposit);
            ACROSS_HUB.addLiquidity(l1Token, amountToDeposit);

            // Check received shares meet minimum
            sharesAfter = IERC20(lpToken).balanceOf(address(this));
            uint256 sharesReceived = sharesAfter + feeInTokens - sharesBefore;
            require(
                sharesReceived >= _inputData.minSharesReceived,
                Errors.Action_InsufficientSharesReceived(
                    protocolName(),
                    uint8(actionType()),
                    sharesReceived,
                    _inputData.minSharesReceived
                )
            );
        }
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "AcrossV3";
    }
}
