// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IGasPriceAdaptor} from "../../../interfaces/IGasPriceAdaptor.sol";
import {IAggregatorV3} from "../../../interfaces/chainlink/IAggregatorV3.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title CommonGasPriceAdaptor
/// @notice Shared oracle and conversion logic for all gas price adaptors
abstract contract CommonGasPriceAdaptor is IGasPriceAdaptor {
    address public immutable ethUsdOracle;

    constructor(address _ethUsdOracle) {
        ethUsdOracle = _ethUsdOracle;
    }

    /// @notice Get ETH/USD price from Chainlink oracle with staleness check
    /// @return price ETH/USD price (8 decimals)
    /// @return valid True if price is valid and fresh
    function _getEthUsdPrice() internal view returns (int256 price, bool valid) {
        uint256 updatedAt;
        ( , price, , updatedAt, ) = IAggregatorV3(ethUsdOracle).latestRoundData();
        if (price <= 0 || block.timestamp - updatedAt > 1 hours) {
            return (0, false);
        }
        return (price, true);
    }

    /// @notice Calculate conversion exponent for wei to token conversion
    /// @param refundToken Token address (e.g., USDC)
    /// @return exponent Conversion exponent: 18 + oracleDecimals - tokenDecimals
    /// @return valid True if valid token configuration
    function _getConversionExponent(address refundToken) internal view returns (uint256 exponent, bool valid) {
        uint256 oracleDecimals = IAggregatorV3(ethUsdOracle).decimals();
        uint256 tokenDecimals = IERC20Metadata(refundToken).decimals();
        if (tokenDecimals > 18 + oracleDecimals) {
            return (0, false);
        }
        return (18 + oracleDecimals - tokenDecimals, true);
    }

    /// @notice Convert wei amount to token amount using ETH/USD price
    /// @param weiAmount Amount in wei
    /// @param ethUsdPrice ETH/USD price from oracle
    /// @param conversionExponent Conversion exponent
    /// @return Token amount
    function _convertWeiToToken(
        uint256 weiAmount,
        int256 ethUsdPrice,
        uint256 conversionExponent
    ) internal pure returns (uint256) {
        return (weiAmount * uint256(ethUsdPrice)) / (10 ** conversionExponent);
    }

    /// @notice Convert wei per gas to token per gas with 1e18 scaling
    /// @param perGasWei Wei per gas unit
    /// @param ethUsdPrice ETH/USD price from oracle
    /// @param conversionExponent Conversion exponent
    /// @return Rate per gas scaled by 1e18
    function _convertPerGasRate(
        uint256 perGasWei,
        int256 ethUsdPrice,
        uint256 conversionExponent
    ) internal pure returns (uint256) {
        return (perGasWei * uint256(ethUsdPrice) * 1e18) / (10 ** conversionExponent);
    }
}

