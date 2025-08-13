// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule} from "./IEip712TypedDataSafeModule.sol";

/// @title IActionWithBundleContext
/// @notice Interface for actions that need access to the full Bundle and signature
/// @dev Used for special actions like CCTP that need to send the Bundle cross-chain
interface IActionWithBundleContext {
    /// @notice Execute action with full Bundle context
    /// @param actionCallData The action-specific calldata (without bundle/signature)
    /// @param bundle The complete Bundle being executed
    /// @param bundleSignature The EIP-712 signature for the Bundle
    /// @param strategyId Strategy identifier for logging
    function executeActionWithBundleContext(
        bytes calldata actionCallData,
        IEip712TypedDataSafeModule.Bundle calldata bundle,
        bytes calldata bundleSignature,
        uint16 strategyId
    ) external payable;
} 