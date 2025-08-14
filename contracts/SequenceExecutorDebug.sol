// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {SequenceExecutor} from "./SequenceExecutor.sol";
import {IEip712TypedDataSafeModule} from "./interfaces/IEip712TypedDataSafeModule.sol";
import {IActionWithBundleContext} from "./interfaces/IActionWithBundleContext.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAction} from "./interfaces/IAction.sol";
import {Errors} from "./Errors.sol";
import "hardhat/console.sol";

// @dev Basically the same as SequenceExecutor, but with debug prints
// @dev This is to be used for debugging only
contract SequenceExecutorDebug is SequenceExecutor {
    constructor(address _adminVault) SequenceExecutor(_adminVault) {}

    function executeSequence(
        Sequence calldata _currSequence,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) public payable virtual override {
        console.log("Executing sequence:", _currSequence.name);
        console.log("Number of actions:", _currSequence.actionIds.length);
        console.log("Bundle sequences length:", _bundle.sequences.length);
        console.log("Strategy ID:", _strategyId);

        // Add check that the sequence is valid
        for (uint256 i = 0; i < _currSequence.actionIds.length; ++i) {
            try ADMIN_VAULT.getActionAddress(_currSequence.actionIds[i]) returns (address actionAddr) {
                console.log("Action address from vault:", actionAddr);
            } catch {
                console.log("Action not found for ID:", uint256(uint32(_currSequence.actionIds[i])));
            }
        }

        super.executeSequence(_currSequence, _bundle, _signature, _strategyId);
    }

    function _executeAction(
        Sequence memory _currSequence,
        uint256 _index,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) internal virtual override {
        bytes4 actionId = _currSequence.actionIds[_index];
        bytes memory callData = _currSequence.callData[_index];
        address actionAddress = ADMIN_VAULT.getActionAddress(actionId);
        
        console.log("Executing action:", uint256(uint32(actionId)));
        console.log("Action address:", actionAddress);
        console.log("Call data length:", callData.length);
        
        if (actionAddress == address(0)) { 
            console.log("Action not found for ID:", uint256(uint32(actionId)));
            revert Errors.EIP712TypedDataSafeModule_ActionNotFound(actionId); 
        }
        
        bool hasBundleContext = _bundle.sequences.length > 0;
        console.log("Has bundle context:", hasBundleContext);
        
        if (hasBundleContext && IERC165(actionAddress).supportsInterface(type(IActionWithBundleContext).interfaceId)) {
            console.log("Using bundle context for action");
            // Bundle execution: Use delegate call to ensure address(this) = Safe
            (bool success, bytes memory returnData) = actionAddress.delegatecall(
                abi.encodeWithSelector(
                    IActionWithBundleContext.executeActionWithBundleContext.selector,
                    callData,
                    _bundle,
                    _signature,
                    _strategyId
                )
            );
            if (!success) {
                console.log("Bundle action execution failed");
                // Forward the revert reason for bundle actions
                if (returnData.length > 0) {
                    assembly {
                        revert(add(returnData, 0x20), mload(returnData))
                    }
                } else {
                    revert("Bundle action execution failed");
                }
            }
        } else {
            console.log("Using standard action execution");
            // Delegate call to executeAction  
            // Extract parameters from the encoded function call
            // callData format: [4-byte selector][inputParams][strategyId]
            
            bytes memory actionCallData;
            uint16 actionStrategyId;
            
            // Decode the function call to extract parameters
            if (callData.length >= 4) {
                bytes4 selector;
                assembly {
                    selector := mload(add(callData, 0x20))
                }
                if (selector == IAction.executeAction.selector) {
                    // Create new bytes array for the parameters (skip first 4 bytes)
                    bytes memory parametersData = new bytes(callData.length - 4);
                    for (uint256 i = 0; i < callData.length - 4; i++) {
                        parametersData[i] = callData[i + 4];
                    }
                    // Decode the parameters from the function call
                    (actionCallData, actionStrategyId) = abi.decode(parametersData, (bytes, uint16));
                } else {
                    // Fallback: treat callData as raw parameters
                    actionCallData = callData;
                    actionStrategyId = _strategyId;
                }
            } else {
                // Fallback: treat callData as raw parameters  
                actionCallData = callData;
                actionStrategyId = _strategyId;
            }
            
            bytes memory delegateCallData = abi.encodeWithSelector(IAction.executeAction.selector, actionCallData, actionStrategyId);
            
            (bool success, bytes memory returnData) = actionAddress.delegatecall(delegateCallData);
            if (!success) {
                console.log("Action execution failed");
                // Forward the revert reason
                if (returnData.length > 0) {
                    assembly {
                        revert(add(returnData, 0x20), mload(returnData))
                    }
                } else {
                    revert("Action execution failed");
                }
            }
        }
        
        console.log("Action completed successfully");
    }
}
