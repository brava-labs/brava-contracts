// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {CommonGasPriceAdaptor} from "./CommonGasPriceAdaptor.sol";

/// @title Eip1559GasPriceAdaptor
/// @notice Provides gas pricing for EIP-1559 chains using basefee + fixed priority tip
contract Eip1559GasPriceAdaptor is CommonGasPriceAdaptor {
    uint256 public immutable fixedPriorityFeeWei;

    /// @param _fixedPriorityFeeWei Fixed tip in wei added to basefee
    /// @param _ethUsdOracle Chainlink ETH/USD oracle address
    constructor(uint256 _fixedPriorityFeeWei, address _ethUsdOracle) 
        CommonGasPriceAdaptor(_ethUsdOracle) 
    {
        fixedPriorityFeeWei = _fixedPriorityFeeWei;
    }

    /// @notice Get refund rate per gas for EIP-1559 chains
    /// @dev Rate is scaled by 1e18 for precision
    function getRefundRate(
        address refundToken,
        bytes calldata /* outerTxCalldata */
    ) external view returns (uint256 ratePerGas, uint256 fixedFee) {
        (int256 ethUsdPrice, bool validPrice) = _getEthUsdPrice();
        if (!validPrice) return (0, 0);
        
        (uint256 conversionExponent, bool validToken) = _getConversionExponent(refundToken);
        if (!validToken) return (0, 0);
        
        uint256 perGasWei = block.basefee + fixedPriorityFeeWei;
        ratePerGas = _convertPerGasRate(perGasWei, ethUsdPrice, conversionExponent);
        fixedFee = 0;
    }
}


