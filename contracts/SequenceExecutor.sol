// SPDX-License-Identifier: MIT

pragma solidity =0.8.28;

import {IAdminVault} from "./interfaces/IAdminVault.sol";
import {IActionWithBundleContext} from "./interfaces/IActionWithBundleContext.sol";
import {IEip712TypedDataSafeModule} from "./interfaces/IEip712TypedDataSafeModule.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IAction} from "./interfaces/IAction.sol";
import {Errors} from "./Errors.sol";

/**
 * @title Entry point into executing Sequences
 *
 *                                                                                                                            ┌────────────────┐
 *                                                                                                                        ┌───┤  1st Action    │
 *                                                                                                                        │   └────────────────┘
 *                                                                                                                        │
 *   Actor                    ┌──────────────┐                      ┌───────────---─────┐                                 │   ┌────────────────┐
 *    ┌─┐                     │              │   Delegate call      │                   │    Delegate call each action    ├───┤  2nd Action    │
 *    └┼┘                     │              │   - executeSequence()│                   │         - executeAction()       │   └────────────────┘
 *  ── │ ──  ─────────────────┤ Safe Wallet  ├──────────────────--──┤  Sequence Executor├─────────────────────────────────┤
 *    ┌┴┐                     │              │                      │                   │                                 │    . . .
 *    │ │                     │              │                      │                   │                                 │
 *                            └──────────────┘                      └──────────---──────┘                                 │   ┌────────────────┐
 *                                                                                                                        └───┤  nth Action    │
 *                                                                                                                            └────────────────┘
 *
 *
 */
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract SequenceExecutor {
    /// @dev List of actions grouped as a sequence
    /// @param name Name of the sequence useful for logging what sequence is executing
    /// @param callData Array of calldata inputs to each action
    /// @param actionIds Array of identifiers for actions - bytes4(keccak256(ActionName))
    struct Sequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    IAdminVault public immutable ADMIN_VAULT;
    event SequenceExecuted(bytes32 indexed sequenceHash, address indexed executor, uint256 totalActions, uint256 totalGasUsed);

    constructor(address _adminVault) { ADMIN_VAULT = IAdminVault(_adminVault); }

    function executeSequence(
        Sequence calldata _currSequence,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) public payable virtual {
        _executeActions(_currSequence, _bundle, _signature, _strategyId);
    }

    function _executeActions(
        Sequence memory _currSequence,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) internal {
        for (uint256 i = 0; i < _currSequence.actionIds.length; ++i) {
            _executeAction(_currSequence, i, _bundle, _signature, _strategyId);
        }
    }

    function _executeAction(
        Sequence memory _currSequence,
        uint256 _index,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) internal virtual {
        bytes4 actionId = _currSequence.actionIds[_index];
        bytes memory callData = _currSequence.callData[_index];
        address actionAddress = ADMIN_VAULT.getActionAddress(actionId);
        if (actionAddress == address(0)) { revert Errors.EIP712TypedDataSafeModule_ActionNotFound(actionId); }
        bool hasBundleContext = _bundle.sequences.length > 0;
        bool supportsBundleContext = false;
        if (hasBundleContext) {
            // Use low-level call to avoid revert if action doesn't implement ERC165
            (bool success, bytes memory result) = actionAddress.staticcall(
                abi.encodeWithSelector(IERC165.supportsInterface.selector, type(IActionWithBundleContext).interfaceId)
            );
            if (success && result.length >= 32) {
                supportsBundleContext = abi.decode(result, (bool));
            }
        }
        
        if (hasBundleContext && supportsBundleContext) {
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
                // Forward the revert reason
                if (returnData.length > 0) {
                    assembly {
                        revert(add(returnData, 0x20), mload(returnData))
                    }
                } else {
                    revert("Bundle action execution failed");
                }
            }
        } else {
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
            
            (bool success, bytes memory returnData) = actionAddress.delegatecall(
                abi.encodeWithSelector(IAction.executeAction.selector, actionCallData, actionStrategyId)
            );
            if (!success) {
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
    }
}
