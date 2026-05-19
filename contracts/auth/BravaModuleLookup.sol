// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {Errors} from "../Errors.sol";
import {IBravaSafeModule} from "../interfaces/IBravaSafeModule.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";

/// @title BravaModuleLookup
/// @notice Discovers the unique Brava module currently enabled on a Safe by ERC-165 introspection.
///         Used by bridge relays (`CCTPBundleReceiver`, `AuthRegistry.relayCCTPAndExecute`) so
///         they never hold a module address and survive module upgrades unchanged.
/// @dev Iterates a single page (`MAX_MODULES_SCANNED`) of `getModulesPaginated` starting at the
///      sentinel and matches any module whose `supportsInterface(IBravaSafeModule.interfaceId)`
///      returns true. Reverts on zero or more than one match — the Safe owner resolves both states
///      with a single Safe transaction (enable Brava module / disable old before enabling new).
library BravaModuleLookup {
    /// @notice Sentinel start address used by Safe's modules linked-list iteration.
    address internal constant SENTINEL_MODULES = address(0x1);

    /// @notice Maximum number of modules scanned per lookup. Bounds gas cost and matches realistic
    ///         Safe configurations; Brava Safes ship with one module by default.
    uint256 internal constant MAX_MODULES_SCANNED = 10;

    /// @notice Finds the single Brava module enabled on `safe`.
    /// @dev Only the first `MAX_MODULES_SCANNED` (10) modules in the Safe's linked-list are checked.
    ///      If the Brava module sits beyond that position, `NoBravaModuleEnabled` is reverted even
    ///      though the module is technically enabled. Callers or Safe owners should ensure the Brava
    ///      module is within the first 10 entries (reorder via disable + re-enable if needed).
    ///      Reverts `MultipleBravaModules` if more than one match, `NoBravaModuleEnabled` if none.
    function findEnabledBravaModule(ISafe safe) internal view returns (address) {
        (bool ok, address module, address duplicate) = _findBravaModule(safe);
        if (!ok) {
            if (duplicate != address(0)) {
                revert Errors.MultipleBravaModules(module, duplicate);
            }
            revert Errors.NoBravaModuleEnabled(address(safe));
        }
        return module;
    }

    /// @notice Non-reverting variant of `findEnabledBravaModule`. Returns `(false, address(0))` when
    ///         no unique Brava module is found (zero or multiple matches, or getModulesPaginated
    ///         reverts). Used by best-effort relay paths that must not unwind USDC mints.
    function tryFindEnabledBravaModule(ISafe safe) internal view returns (bool, address) {
        (bool ok, address module,) = _findBravaModule(safe);
        return (ok, module);
    }

    /// @dev Core lookup logic. Returns (true, module, 0) on unique match,
    ///      (false, first, second) on multiple matches, or (false, 0, 0) on no match.
    function _findBravaModule(ISafe safe) private view returns (bool, address, address) {
        bytes4 marker = type(IBravaSafeModule).interfaceId;

        address[] memory modules;
        try safe.getModulesPaginated(SENTINEL_MODULES, MAX_MODULES_SCANNED) returns (
            address[] memory mods, address
        ) {
            modules = mods;
        } catch {
            return (false, address(0), address(0));
        }

        address found;
        for (uint256 i; i < modules.length; ++i) {
            address candidate = modules[i];
            try IERC165(candidate).supportsInterface(marker) returns (bool ok) {
                if (ok) {
                    if (found != address(0)) {
                        return (false, found, candidate);
                    }
                    found = candidate;
                }
            } catch {} // solhint-disable-line no-empty-blocks
        }

        if (found == address(0)) {
            return (false, address(0), address(0));
        }
        return (true, found, address(0));
    }
}
