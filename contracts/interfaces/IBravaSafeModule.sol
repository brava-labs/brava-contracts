// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule as ITyped} from "./IEip712TypedDataSafeModule.sol";

/// @title IBravaSafeModule
/// @notice Marker interface used for ERC-165 discovery of the Brava Safe module currently enabled
///         on a given Safe. Intentionally minimal — only the bundle execution entry point — so that
///         the `interfaceId` stays stable across module upgrades that add features but keep the
///         primary entry point shape.
/// @dev Bridge relay paths (`CCTPBundleReceiver`, `AuthRegistry.relayCCTPAndExecute`) use
///      `BravaModuleLookup` to find the unique enabled module on a Safe that returns true from
///      `supportsInterface(type(IBravaSafeModule).interfaceId)`. This decouples relay infrastructure
///      from any single module address, so module upgrades require no redeploys downstream.
///      IMPORTANT: `interfaceId` is derived from the `executeBundle` selector, which includes the
///      canonical encoding of `Bundle` and its nested structs. Changing ANY struct field (adding,
///      removing, reordering) changes the selector AND the interfaceId. This is intentional —
///      a struct change is already an ABI-breaking event for all callers, and the interfaceId
///      shift ensures relay paths fail-fast rather than silently mis-encoding calls.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
interface IBravaSafeModule {
    /// @notice Executes a validated bundle for the current chain and nonce
    /// @param _safeAddr The Safe address to execute on
    /// @param _bundle The bundle containing sequences for multiple chains and an optional auth update
    /// @param _signatures Packed EIP-712 signatures sorted by signer address ascending
    function executeBundle(
        address _safeAddr,
        ITyped.Bundle calldata _bundle,
        bytes calldata _signatures
    ) external;
}
