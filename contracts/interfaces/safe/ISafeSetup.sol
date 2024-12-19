// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

/**
 * @title SafeSetup - A utility contract for setting up a Safe.
 */
interface ISafeSetup {
    /**
     * @notice Enable the specified Safe modules.
     * @dev This call will only work if used from a Safe via delegatecall. It is intended to be used as part of the
     *      Safe `setup`, allowing Safes to be created with an initial set of enabled modules.
     * @param modules The modules to enable.
     */
    function enableModules(address[] calldata modules) external;

    /**
     * @notice Set the guard for the Safe.
     * @param guard The address of the guard to be used or the 0 address to disable the guard
     */
    function setGuard(address guard) external;

    /**
     * @notice Set the fallback handler for the Safe.
     * @param handler The address of the fallback handler to be used
     */
    function setFallbackHandler(address handler) external;

    /**
     * @notice Setup the Safe with the specified modules, guard, and fallback handler.
     * @param modules The modules to enable.
     * @param guard The address of the guard to be used or the 0 address to disable the guard
     * @param fallbackHandler The address of the fallback handler to be used or the 0 address to disable the fallback handler
     */
    function setup(address[] calldata modules, address guard, address fallbackHandler) external;
}
