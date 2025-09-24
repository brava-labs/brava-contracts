// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IGasPriceAdaptor} from "../../../interfaces/IGasPriceAdaptor.sol";
import {IAggregatorV3} from "../../../interfaces/chainlink/IAggregatorV3.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title Eip1559GasPriceAdaptor
/// @notice Provides gas pricing for EIP-1559 chains using basefee + fixed priority tip
contract Eip1559GasPriceAdaptor is IGasPriceAdaptor {
    /// @notice Fixed priority tip added to basefee
    uint256 public immutable fixedPriorityFeeWei;
    address public immutable ethUsdOracle;

    /// @param _fixedPriorityFeeWei Fixed tip in wei added to basefee
    constructor(uint256 _fixedPriorityFeeWei, address _ethUsdOracle) {
        fixedPriorityFeeWei = _fixedPriorityFeeWei;
        ethUsdOracle = _ethUsdOracle;
    }

    /// @inheritdoc IGasPriceAdaptor
    function totalWeiCost(uint256 gasUsed, bytes calldata /* outerTxCalldata */) external view returns (uint256) {
        uint256 perGasWei = block.basefee + fixedPriorityFeeWei;
        return gasUsed * perGasWei;
    }

    function refundAmountInToken(
        uint256 gasUsed,
        address refundToken,
        bytes calldata /* outerTxCalldata */
    ) external view returns (uint256 amount) {
        if (gasUsed == 0) return 0;
        ( , int256 ethUsdPrice, , uint256 updatedAt, ) = IAggregatorV3(ethUsdOracle).latestRoundData();
        if (ethUsdPrice <= 0) return 0;
        // 1 hour staleness window to mirror module defaults; adjust if needed per-chain
        if (block.timestamp - updatedAt > 1 hours) return 0;

        uint256 oracleDecimals = IAggregatorV3(ethUsdOracle).decimals();
        uint256 tokenDecimals = IERC20Metadata(refundToken).decimals();
        if (tokenDecimals > 18 + oracleDecimals) return 0;
        uint256 conversionExponent = 18 + oracleDecimals - tokenDecimals;

        uint256 weiCost = gasUsed * (block.basefee + fixedPriorityFeeWei);
        amount = (weiCost * uint256(ethUsdPrice)) / (10 ** conversionExponent);
    }
}


