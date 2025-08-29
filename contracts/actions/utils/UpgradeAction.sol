// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {ActionBase} from "../ActionBase.sol";
import {Errors} from "../../Errors.sol";
import {ISafeSetupRegistry} from "../../interfaces/ISafeSetupRegistry.sol";
import {ISafe} from "../../interfaces/safe/ISafe.sol";

/// @title UpgradeAction - An action for upgrading Safe configuration to match registry
/// @notice This contract upgrades Safe configuration by comparing current state with SafeSetupRegistry target
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract UpgradeAction is ActionBase {
    /// @notice The Safe setup registry contract
    ISafeSetupRegistry public immutable SAFE_SETUP_REGISTRY;

    constructor(address _adminVault, address _logger, address _safeSetupRegistry) ActionBase(_adminVault, _logger) {
        require(_safeSetupRegistry != address(0), Errors.InvalidInput("UpgradeAction", "constructor"));
        SAFE_SETUP_REGISTRY = ISafeSetupRegistry(_safeSetupRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory /*_callData*/, uint16 /*_strategyId*/) public payable override {
        // Get target configuration from registry
        ISafeSetupRegistry.SafeSetupConfig memory targetConfig = SAFE_SETUP_REGISTRY.getCurrentConfig();
        
        // Get current Safe configuration
        address currentGuard = getCurrentGuard();
        address currentFallbackHandler = getCurrentFallbackHandler();
        
        // 1. Change guard first if needed (prevents blocking subsequent operations)
        if (currentGuard != targetConfig.guard) {
            ISafe(address(this)).setGuard(targetConfig.guard);
        }
        
        // 2. Remove modules not in target configuration
        removeUnwantedModules(targetConfig.modules);
        
        // 3. Add modules missing from current configuration
        addMissingModules(targetConfig.modules);
        
        // 4. Update fallback handler if needed
        if (currentFallbackHandler != targetConfig.fallbackHandler) {
            ISafe(address(this)).setFallbackHandler(targetConfig.fallbackHandler);
        }
        
        // Log the upgrade event
        LOGGER.logActionEvent(LogType.UPGRADE_ACTION, abi.encode(address(this), targetConfig));
    }

    /// @notice Remove modules that are not in the target configuration
    /// @param targetModules Array of modules that should be enabled
    function removeUnwantedModules(address[] memory targetModules) internal {
        address prevModule = address(0x1); // SENTINEL_MODULES
        address currModule;
        
        // Get first module
        (address[] memory modules,) = ISafe(address(this)).getModulesPaginated(prevModule, 1);
        if (modules.length == 0) return; // No modules to process
        
        currModule = modules[0];
        
        while (currModule != address(0x1)) { // While not back to sentinel
            // Check if current module should be removed
            if (!isModuleInTargetList(currModule, targetModules)) {
                // Remove the module using the previous module reference
                ISafe(address(this)).disableModule(prevModule, currModule);
                
                // After removal, get the next module (prevModule stays the same)
                (modules,) = ISafe(address(this)).getModulesPaginated(prevModule, 1);
                currModule = modules.length > 0 ? modules[0] : address(0x1);
            } else {
                // Keep the module, advance both pointers
                prevModule = currModule;
                (modules,) = ISafe(address(this)).getModulesPaginated(currModule, 1);
                currModule = modules.length > 0 ? modules[0] : address(0x1);
            }
        }
    }

    /// @notice Add modules that are missing from current configuration
    /// @param targetModules Array of modules that should be enabled
    function addMissingModules(address[] memory targetModules) internal {
        for (uint256 i = 0; i < targetModules.length; i++) {
            if (!ISafe(address(this)).isModuleEnabled(targetModules[i])) {
                ISafe(address(this)).enableModule(targetModules[i]);
            }
        }
    }

    /// @notice Check if a module is in the target modules list
    /// @param module Module address to check
    /// @param targetModules Array of target modules
    /// @return bool True if module is in target list
    function isModuleInTargetList(address module, address[] memory targetModules) internal pure returns (bool) {
        for (uint256 i = 0; i < targetModules.length; i++) {
            if (targetModules[i] == module) {
                return true;
            }
        }
        return false;
    }

    /// @notice Get current guard from Safe
    /// @return address Current guard address (0x0 if no guard)
    function getCurrentGuard() internal view returns (address) {
        // Safe stores guard in storage slot 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8
        bytes32 guardSlot = 0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;
        address guard;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            guard := sload(guardSlot)
        }
        return guard;
    }

    /// @notice Get current fallback handler from Safe
    /// @return address Current fallback handler address
    function getCurrentFallbackHandler() internal view returns (address) {
        // Safe stores fallback handler in storage slot 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5
        bytes32 fallbackSlot = 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;
        address fallbackHandler;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            fallbackHandler := sload(fallbackSlot)
        }
        return fallbackHandler;
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.CUSTOM_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "UpgradeAction";
    }
}
