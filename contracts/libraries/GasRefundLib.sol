// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAggregatorV3} from "../interfaces/chainlink/IAggregatorV3.sol";
import {ITokenRegistry} from "../interfaces/ITokenRegistry.sol";
import {Errors} from "../Errors.sol";

/// @title GasRefundLib
/// @dev Library for handling gas refunds in stablecoin tokens
library GasRefundLib {
    using SafeERC20 for IERC20;

    uint256 public constant GAS_OVERHEAD = 21000;
    uint256 public constant ORACLE_STALENESS_THRESHOLD = 1 hours;

    enum RefundRecipient {
        EXECUTOR,
        FEE_RECIPIENT
    }

    struct GasRefundContext {
        address refundToken;
        uint256 maxRefundAmount;
    }

    struct RefundParams {
        uint256 startGas;
        uint256 endGas;
        address refundToken;
        uint256 maxRefundAmount;
        RefundRecipient refundTo;
        address executor;
        address feeRecipient;
        ITokenRegistry tokenRegistry;
        IAggregatorV3 ethUsdOracle;
    }

    /// @dev Process gas refund for a transaction
    /// @param params All parameters needed for gas refund calculation and execution
    /// @return refundAmount Amount refunded in refund token
    function processGasRefund(RefundParams memory params) internal returns (uint256 refundAmount) {
        // Validate refund token is approved
        if (!params.tokenRegistry.isApprovedToken(params.refundToken)) {
            revert Errors.EIP712TypedDataSafeModule_RefundTokenNotApproved(params.refundToken);
        }

        // Calculate gas used
        uint256 gasUsed = params.startGas - params.endGas + GAS_OVERHEAD;

        // Get ETH price in USD (18 decimals)
        uint256 ethPriceUsd = _getEthPriceFromOracle(params.ethUsdOracle);

        // Calculate refund amount in stablecoin
        uint256 tokenDecimals = IERC20Metadata(params.refundToken).decimals();
        refundAmount = (gasUsed * tx.gasprice * ethPriceUsd) / (10 ** (18 + 8 - tokenDecimals));

        // Cap at maximum refund amount
        if (refundAmount > params.maxRefundAmount) {
            refundAmount = params.maxRefundAmount;
        }

        // Resolve refund recipient
        address refundRecipient = _resolveRefundRecipient(params.refundTo, params.executor, params.feeRecipient);

        // Transfer refund
        IERC20(params.refundToken).safeTransfer(refundRecipient, refundAmount);

        return refundAmount;
    }

    /// @dev Get ETH price from Chainlink oracle with validation
    /// @param oracle Chainlink ETH/USD price feed
    /// @return price ETH price in USD with 8 decimals
    function _getEthPriceFromOracle(IAggregatorV3 oracle) private view returns (uint256 price) {
        try oracle.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256 /* startedAt */,
            uint256 updatedAt,
            uint80 /* answeredInRound */
        ) {
            if (answer <= 0) revert Errors.EIP712TypedDataSafeModule_InvalidOraclePrice(answer);
            if (block.timestamp - updatedAt > ORACLE_STALENESS_THRESHOLD) revert Errors.EIP712TypedDataSafeModule_StaleOraclePrice(updatedAt, block.timestamp);
            if (roundId == 0) revert Errors.EIP712TypedDataSafeModule_InvalidOracleRound(roundId, roundId);

            return uint256(answer);
        } catch {
            revert Errors.EIP712TypedDataSafeModule_InvalidOraclePrice(0);
        }
    }

    /// @dev Resolve refund recipient based on enum value
    /// @param refundTo Refund recipient enum
    /// @param executor Transaction executor address
    /// @param feeRecipient Fee recipient address
    /// @return recipient Resolved recipient address
    function _resolveRefundRecipient(
        RefundRecipient refundTo,
        address executor,
        address feeRecipient
    ) private pure returns (address recipient) {
        if (refundTo == RefundRecipient.EXECUTOR) {
            return executor;
        } else if (refundTo == RefundRecipient.FEE_RECIPIENT) {
            if (feeRecipient == address(0)) revert Errors.EIP712TypedDataSafeModule_InvalidRefundRecipient(uint8(refundTo));
            return feeRecipient;
        } else {
            revert Errors.EIP712TypedDataSafeModule_InvalidRefundRecipient(uint8(refundTo));
        }
    }
} 