// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IGasPriceAdaptor} from "../interfaces/IGasPriceAdaptor.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @title GasRefundTest
/// @notice Simple contract to test gas refund calculation methodology
contract GasRefundTest {
    struct GasTestResult {
        uint256 gasUsed;
        uint256 totalGasForRefund;
        uint256 ratePerGas;
        uint256 fixedFee;
        uint256 refundAmount;
        uint256 blockBaseFee;
    }
    
    event GasRefundCalculated(
        uint256 gasStart,
        uint256 gasEnd,
        uint256 gasUsed,
        uint256 totalGasForRefund,
        uint256 ratePerGas,
        uint256 fixedFee,
        uint256 refundAmount,
        uint256 blockBaseFee
    );

    /// @notice Test gas refund calculation
    /// @param targetGasConsumption How much gas to burn in the loop
    /// @param gasOverhead Overhead to add to measured gas (simulates post-measurement costs)
    /// @param adaptor Address of the gas price adaptor to test
    /// @param token Address of the refund token (e.g., USDC)
    function testGasRefund(
        uint256 targetGasConsumption,
        uint256 gasOverhead,
        address adaptor,
        address token
    ) external {
        uint256 gasStart = gasleft();
        
        // Burn gas until we exceed target
        uint256 counter = 0;
        uint256 gasConsumed = 0;
        while (gasConsumed < targetGasConsumption) {
            counter++;
            gasConsumed = gasStart - gasleft();
        }
        
        // Get refund rate from adaptor
        (uint256 ratePerGas, uint256 fixedFee) = IGasPriceAdaptor(adaptor).getRefundRate(
            token,
            msg.data
        );
        
        // Measure gas at the end
        uint256 gasEnd = gasleft();
        uint256 gasUsed = gasStart - gasEnd;
        uint256 totalGasForRefund = gasUsed + gasOverhead;
        
        // Calculate refund amount (same formula as in EIP712TypedDataSafeModule)
        uint256 refundAmount = (totalGasForRefund * ratePerGas) / 1e18 + fixedFee;
        
        // Emit all the details
        emit GasRefundCalculated(
            gasStart,
            gasEnd,
            gasUsed,
            totalGasForRefund,
            ratePerGas,
            fixedFee,
            refundAmount,
            block.basefee
        );
    }
}

