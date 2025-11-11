// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IGasPriceAdaptor} from "../../../interfaces/IGasPriceAdaptor.sol";
import {IAggregatorV3} from "../../../interfaces/chainlink/IAggregatorV3.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

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
/// @notice Provides gas pricing for Arbitrum using ArbGasInfo
contract ArbitrumGasPriceAdaptor is IGasPriceAdaptor {
    IArbGasInfo public immutable arbGasInfo;
    address public immutable ethUsdOracle;

    /// @param _arbGasInfo Arbitrum ArbGasInfo contract address (0x000...006C)
    constructor(address _arbGasInfo, address _ethUsdOracle) {
        require(_arbGasInfo != address(0), "Invalid oracle");
        arbGasInfo = IArbGasInfo(_arbGasInfo);
        ethUsdOracle = _ethUsdOracle;
    }

    /// @inheritdoc IGasPriceAdaptor
    function totalWeiCost(uint256 gasUsed, bytes calldata /* outerTxCalldata */) external view returns (uint256) {
        (uint256 perL2TxWei, uint256 perArbGasWei, , , , ) = arbGasInfo.getPricesInWei();
        return perL2TxWei + (gasUsed * perArbGasWei);
    }

    function refundAmountInToken(
        uint256 gasUsed,
        address refundToken,
        bytes calldata /* outerTxCalldata */
    ) external view returns (uint256 amount) {
        if (gasUsed == 0) return 0;
        ( , int256 ethUsdPrice, , uint256 updatedAt, ) = IAggregatorV3(ethUsdOracle).latestRoundData();
        if (ethUsdPrice <= 0) return 0;
        if (block.timestamp - updatedAt > 1 hours) return 0;
        uint256 oracleDecimals = IAggregatorV3(ethUsdOracle).decimals();
        uint256 tokenDecimals = IERC20Metadata(refundToken).decimals();
        if (tokenDecimals > 18 + oracleDecimals) return 0;
        uint256 conversionExponent = 18 + oracleDecimals - tokenDecimals;
        uint256 weiCost = this.totalWeiCost(gasUsed, "");
        amount = (weiCost * uint256(ethUsdPrice)) / (10 ** conversionExponent);
    }
}


