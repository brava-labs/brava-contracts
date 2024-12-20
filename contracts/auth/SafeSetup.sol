// SPDX-License-Identifier: MIT

pragma solidity 0.8.28;

import { ISafe } from "../interfaces/safe/ISafe.sol";


/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract SafeSetup {
    /**
     * @notice Enable the specified Safe modules.
     * @dev This call will only work if used from a Safe via delegatecall. It is intended to be used as part of the
     *      Safe `setup`, allowing Safes to be created with an initial set of enabled modules.
     * @param modules The modules to enable.
     */
    function enableModules(address[] calldata modules) public {
        for (uint256 i = 0; i < modules.length; i++) {
            ISafe(address(this)).enableModule(modules[i]);
        }
    }

    /**
     * @notice Set the guard for the Safe.
     * @dev This call will only work if used from a Safe via delegatecall. It is intended to be used as part of the
     *      Safe `setup`, allowing Safes to be created with a guard.
     * @param guard The address of the guard to be used or the 0 address to disable the guard
     */
    function setGuard(address guard) public {
        ISafe(address(this)).setGuard(guard);
    }

    /**
     * @notice Set the fallback handler for the Safe.
     * @dev This call will only work if used from a Safe via delegatecall. It is intended to be used as part of the
     *      Safe `setup`, allowing Safes to be created with a fallback handler.
     * @param handler The address of the fallback handler to be used
     */
    function setFallbackHandler(address handler) public {
        ISafe(address(this)).setFallbackHandler(handler);
    }

    /**
     * @notice Setup the Safe with the specified modules, guard, and fallback handler.
     * @dev This call will only work if used from a Safe via delegatecall. It is intended to be used as part of the
     *      Safe `setup`, allowing Safes to be created with an initial set of enabled modules, a guard, and a fallback handler.
     * @param modules The modules to enable.
     * @param guard The address of the guard to be used
     * @param fallbackHandler The address of the fallback handler
     */
    function setup(address[] calldata modules, address guard, address fallbackHandler) public {
        if (modules.length > 0) {
            enableModules(modules);
        }
        if (fallbackHandler != address(0)) {
            setFallbackHandler(fallbackHandler);
        }
        if (guard != address(0)) {
            setGuard(guard);
        }
    }
}
