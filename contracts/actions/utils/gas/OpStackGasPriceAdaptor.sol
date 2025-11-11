// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {CommonGasPriceAdaptor} from "./CommonGasPriceAdaptor.sol";

/// @notice Minimal interface for OP Stack Gas Price Oracle
interface IOpGasPriceOracle {
    function getL1Fee(bytes calldata data) external view returns (uint256);
}

/// @title OpStackGasPriceAdaptor
/// @notice Provides gas pricing for OP Stack chains using block.basefee and L1 data fee from oracle
contract OpStackGasPriceAdaptor is CommonGasPriceAdaptor {
    IOpGasPriceOracle public immutable gasPriceOracle;
    uint256 public immutable fixedPriorityFeeWei;

    /// @param _oracle OP Stack GasPriceOracle address (commonly 0x4200...000F)
    /// @param _ethUsdOracle Chainlink ETH/USD oracle address
    /// @param _fixedPriorityFeeWei Fixed priority fee in wei to add to base fee
    constructor(address _oracle, address _ethUsdOracle, uint256 _fixedPriorityFeeWei) 
        CommonGasPriceAdaptor(_ethUsdOracle)
    {
        require(_oracle != address(0), "Invalid oracle");
        gasPriceOracle = IOpGasPriceOracle(_oracle);
        fixedPriorityFeeWei = _fixedPriorityFeeWei;
    }

    /// @notice Get refund rate per gas and fixed L1 fee
    /// @dev Rate is scaled by 1e18 for precision
    function getRefundRate(
        address refundToken,
        bytes calldata outerTxCalldata
    ) external view returns (uint256 ratePerGas, uint256 fixedFee) {
        (int256 ethUsdPrice, bool validPrice) = _getEthUsdPrice();
        if (!validPrice) return (0, 0);
        
        (uint256 conversionExponent, bool validToken) = _getConversionExponent(refundToken);
        if (!validToken) return (0, 0);
        
        // L2 execution: basefee + priority fee
        uint256 perGasWei = block.basefee + fixedPriorityFeeWei;
        if (perGasWei == 0) return (0, 0);
        
        ratePerGas = _convertPerGasRate(perGasWei, ethUsdPrice, conversionExponent);
        
        // L1 data posting fee
        (bool ok, bytes memory data) = address(gasPriceOracle).staticcall(
            abi.encodeWithSignature("getL1Fee(bytes)", outerTxCalldata)
        );
        if (!ok || data.length < 32) return (0, 0);
        
        uint256 l1FeeWei = abi.decode(data, (uint256));
        fixedFee = _convertWeiToToken(l1FeeWei, ethUsdPrice, conversionExponent);
    }
}






