// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IGasPriceAdaptor} from "../../../interfaces/IGasPriceAdaptor.sol";
import {IAggregatorV3} from "../../../interfaces/chainlink/IAggregatorV3.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Minimal interface for OP Stack Gas Price Oracle
interface IOpGasPriceOracle {
    function gasPrice() external view returns (uint256);
    function baseFee() external view returns (uint256);
    function overhead() external view returns (uint256);
    function scalar() external view returns (uint256);
    function decimals() external view returns (uint256);
    function getL1Fee(bytes calldata data) external view returns (uint256);
}

/// @title OpStackGasPriceAdaptor
/// @notice Provides gas pricing for OP Stack chains using oracle L2 gas price and L1 data fee
contract OpStackGasPriceAdaptor is IGasPriceAdaptor {
    IOpGasPriceOracle public immutable gasPriceOracle;
    address public immutable ethUsdOracle;

    /// @param _oracle OP Stack GasPriceOracle address (commonly 0x4200...000F)
    constructor(address _oracle, address _ethUsdOracle) {
        require(_oracle != address(0), "Invalid oracle");
        gasPriceOracle = IOpGasPriceOracle(_oracle);
        ethUsdOracle = _ethUsdOracle;
    }

    /// @inheritdoc IGasPriceAdaptor
    function totalWeiCost(uint256 gasUsed, bytes calldata outerTxCalldata) external view returns (uint256) {
        uint256 perGasWei = block.basefee;
        // Attempt gasPrice(); if unavailable, baseFee(); else fallback to block.basefee
        {
            (bool ok, bytes memory data) = address(gasPriceOracle).staticcall(
                abi.encodeWithSignature("gasPrice()")
            );
            if (ok && data.length >= 32) {
                perGasWei = abi.decode(data, (uint256));
            } else {
                (ok, data) = address(gasPriceOracle).staticcall(
                    abi.encodeWithSignature("baseFee()")
                );
                if (ok && data.length >= 32) {
                    perGasWei = abi.decode(data, (uint256));
                }
            }
        }

        uint256 l1Fee = 0;
        {
            (bool ok, bytes memory data) = address(gasPriceOracle).staticcall(
                abi.encodeWithSignature("getL1Fee(bytes)", outerTxCalldata)
            );
            if (ok && data.length >= 32) {
                l1Fee = abi.decode(data, (uint256));
            }
        }
        return gasUsed * perGasWei + l1Fee;
    }

    function refundAmountInToken(
        uint256 gasUsed,
        address refundToken,
        bytes calldata outerTxCalldata
    ) external view returns (uint256 amount) {
        if (gasUsed == 0) return 0;
        ( , int256 ethUsdPrice, , uint256 updatedAt, ) = IAggregatorV3(ethUsdOracle).latestRoundData();
        if (ethUsdPrice <= 0) return 0;
        if (block.timestamp - updatedAt > 1 hours) return 0;
        uint256 oracleDecimals = IAggregatorV3(ethUsdOracle).decimals();
        uint256 tokenDecimals = IERC20Metadata(refundToken).decimals();
        if (tokenDecimals > 18 + oracleDecimals) return 0;
        uint256 conversionExponent = 18 + oracleDecimals - tokenDecimals;
        uint256 weiCost = this.totalWeiCost(gasUsed, outerTxCalldata);
        amount = (weiCost * uint256(ethUsdPrice)) / (10 ** conversionExponent);
    }
}


