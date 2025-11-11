// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {CommonGasPriceAdaptor} from "./CommonGasPriceAdaptor.sol";

/// @notice Minimal interface for Arbitrum ArbGasInfo
interface IArbGasInfo {
    function getPricesInWei() external view returns (
        uint256 perL2TxWei,
        uint256 perArbGasWei,
        uint256 /* perDAWei */,
        uint256 /* perL1CalldataByteWei */,
        uint256 /* perL1TxWei */,
        uint256 /* perL1GasPriceEstimateWei */
    );
}

/// @title ArbitrumGasPriceAdaptor
/// @notice Provides gas pricing for Arbitrum using block.basefee
contract ArbitrumGasPriceAdaptor is CommonGasPriceAdaptor {
    IArbGasInfo public immutable arbGasInfo;

    /// @param _arbGasInfo Arbitrum ArbGasInfo contract address (0x000...006C)
    /// @param _ethUsdOracle Chainlink ETH/USD oracle address
    constructor(address _arbGasInfo, address _ethUsdOracle) 
        CommonGasPriceAdaptor(_ethUsdOracle)
    {
        require(_arbGasInfo != address(0), "Invalid oracle");
        arbGasInfo = IArbGasInfo(_arbGasInfo);
    }

    /// @notice Get refund rate per ArbGas unit
    /// @dev Rate is scaled by 1e18 for precision
    /// @dev Uses block.basefee which includes L1 and L2 costs on Arbitrum
    function getRefundRate(
        address refundToken,
        bytes calldata /* outerTxCalldata */
    ) external view returns (uint256 ratePerGas, uint256 fixedFee) {
        (int256 ethUsdPrice, bool validPrice) = _getEthUsdPrice();
        if (!validPrice) return (0, 0);
        
        (uint256 conversionExponent, bool validToken) = _getConversionExponent(refundToken);
        if (!validToken) return (0, 0);
        
        if (block.basefee == 0) return (0, 0);
        
        ratePerGas = _convertPerGasRate(block.basefee, ethUsdPrice, conversionExponent);
        fixedFee = 0;
    }
}


