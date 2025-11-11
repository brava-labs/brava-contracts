// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IGasPriceAdaptor
/// @notice Chain-specific adaptor interface for pricing gas usage
/// @dev Provides gas pricing rate that allows caller to measure gas consumption accurately
interface IGasPriceAdaptor {
    /// @notice Get the refund rate per gas unit in token terms
    /// @dev Rate is scaled by 1e18 for precision: actualRefund = (gasUsed * ratePerGas) / 1e18 + fixedFee
    /// @dev Caller measures gas after obtaining rate to ensure accurate measurement
    /// @param refundToken Token to calculate rate for (e.g., USDC)
    /// @param outerTxCalldata The calldata of the outer transaction (for L1 fee estimation on L2s)
    /// @return ratePerGas Token units per gas (scaled by 1e18)
    /// @return fixedFee Fixed cost component in token units (e.g., L1 data fee on OP Stack)
    function getRefundRate(
        address refundToken,
        bytes calldata outerTxCalldata
    ) external view returns (uint256 ratePerGas, uint256 fixedFee);
}


