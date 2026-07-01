// SPDX-License-Identifier: BUSL-1.1

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
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
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

    constructor(address _adminVault) { ADMIN_VAULT = IAdminVault(_adminVault); }

    function executeSequence(
        Sequence calldata _currSequence,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) public payable virtual {
        if (_currSequence.callData.length != _currSequence.actionIds.length) {
            revert Errors.EIP712TypedDataSafeModule_LengthMismatch();
        }
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
            (bool ercSuccess, bytes memory ercResult) = actionAddress.staticcall(
                abi.encodeWithSelector(IERC165.supportsInterface.selector, type(IActionWithBundleContext).interfaceId)
            );
            if (ercSuccess && ercResult.length >= 32) {
                supportsBundleContext = abi.decode(ercResult, (bool));
            }
        }

        bool success;
        bytes memory returnData;
        if (hasBundleContext && supportsBundleContext) {
            (success, returnData) = _executeActionWithBundleContext(actionAddress, callData, _bundle, _signature, _strategyId);
        } else {
            (success, returnData) = _executeActionStandard(actionAddress, callData);
        }

        // Wrap any action failure in a SequenceExecutor-owned error, carrying the action's index
        // and id with the original revert nested as `reason`. This pins the top-level selector to
        // this contract so off-chain monitors can attribute the failure to a specific action and
        // cannot be tricked by an action emitting bytes that mimic a native module-error selector.
        if (!success) {
            revert Errors.SequenceExecutor_ActionReverted(_index, actionId, returnData);
        }
    }

    // =============================
    // Standard (non-bundle) execution
    // =============================
    /// @dev Delegatecalls the action with the provided calldata. Returns the raw outcome so the
    ///      caller can wrap any failure with action context (see `_executeAction`).
    function _executeActionStandard(address _actionAddress, bytes memory _fullCallData)
        internal
        returns (bool success, bytes memory returnData)
    {
        (success, returnData) = _actionAddress.delegatecall(_fullCallData);
    }

    // =============================
    // Bundle-context execution
    // =============================
    /// @dev Delegatecalls the action through the bundle-context entry point. Returns the raw outcome
    ///      so the caller can wrap any failure with action context (see `_executeAction`).
    function _executeActionWithBundleContext(
        address _actionAddress,
        bytes memory _actionCallData,
        IEip712TypedDataSafeModule.Bundle calldata _bundle,
        bytes calldata _signature,
        uint16 _strategyId
    ) internal returns (bool success, bytes memory returnData) {
        (success, returnData) = _actionAddress.delegatecall(
            abi.encodeWithSelector(
                IActionWithBundleContext.executeActionWithBundleContext.selector,
                _actionCallData,
                _bundle,
                _signature,
                _strategyId
            )
        );
    }
}
