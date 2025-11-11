// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IGasPriceAdaptor
/// @notice Chain-specific adaptor interface for pricing gas usage
/// @dev Adaptor returns the total wei cost given gasUsed and optional outer calldata context
interface IGasPriceAdaptor {
    /// @notice Returns the total wei cost for a transaction given gasUsed and optional outer tx calldata
    /// @param gasUsed Gas units consumed
    /// @param outerTxCalldata Calldata of the outermost L2 transaction, if available for L1 fee calc
    function totalWeiCost(uint256 gasUsed, bytes calldata outerTxCalldata) external view returns (uint256 totalWei);

    /// @notice Returns the refund amount in the specified token for a given gas usage
    /// @param gasUsed Gas units consumed (should include any desired overhead already)
    /// @param refundToken ERC-20 token to denominate the refund in (e.g., USDC)
    /// @param outerTxCalldata Calldata of the outermost transaction for L1 fee calc on rollups
    function refundAmountInToken(
        uint256 gasUsed,
        address refundToken,
        bytes calldata outerTxCalldata
    ) external view returns (uint256 amount);
}


