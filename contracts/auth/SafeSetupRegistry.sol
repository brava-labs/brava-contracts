// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Errors} from "../Errors.sol";
import {Multicall} from "@openzeppelin/contracts/utils/Multicall.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafeSetupRegistry} from "../interfaces/ISafeSetupRegistry.sol";
import {Roles} from "./Roles.sol";

/// @title SafeSetupRegistry
/// @notice Manages the current Safe setup configuration
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
contract SafeSetupRegistry is Multicall, Roles, ISafeSetupRegistry {
    /// @notice The AdminVault contract that manages permissions
    IAdminVault public immutable ADMIN_VAULT;
    
    /// @notice The Logger contract for events
    ILogger public immutable LOGGER;

    /// @notice The current Safe setup configuration
    SafeSetupConfig public currentConfig;

    /// @notice Constructor to initialize the SafeSetupRegistry
    /// @param _adminVault The address of the AdminVault contract
    /// @param _logger The address of the Logger contract
    constructor(address _adminVault, address _logger) {
        require(
            _adminVault != address(0) && _logger != address(0), 
            Errors.InvalidInput("SafeSetupRegistry", "constructor")
        );
        ADMIN_VAULT = IAdminVault(_adminVault);
        LOGGER = ILogger(_logger);
    }

    /// @notice Modifier to check if caller has a specific role
    modifier onlyRole(bytes32 role) {
        if (!ADMIN_VAULT.hasRole(role, msg.sender)) {
            revert Errors.AdminVault_MissingRole(role, msg.sender);
        }
        _;
    }

    /// @notice Updates the current setup configuration
    /// @param _fallbackHandler Address of the fallback handler contract
    /// @param _modules Array of module addresses to enable
    /// @param _guard Address of the guard contract
    function updateCurrentConfig(
        address _fallbackHandler,
        address[] calldata _modules,
        address _guard
    ) external onlyRole(Roles.OWNER_ROLE) {
        // Validate that at least fallback handler or guard is provided
        require(
            _fallbackHandler != address(0) || _guard != address(0) || _modules.length > 0,
            Errors.InvalidInput("SafeSetupRegistry", "updateCurrentConfig")
        );

        // Update the current configuration
        currentConfig.fallbackHandler = _fallbackHandler;
        currentConfig.modules = _modules;
        currentConfig.guard = _guard;

        emit CurrentConfigurationUpdated(_fallbackHandler, _modules, _guard);
        LOGGER.logAdminVaultEvent(107, abi.encode(_fallbackHandler, _modules, _guard));
    }

    /// @notice Gets the current active setup configuration
    /// @return config The current setup configuration
    function getCurrentConfig() external view returns (SafeSetupConfig memory config) {
        return currentConfig;
    }

    /// @notice Checks if the current configuration includes a specific module
    /// @param _module The module address to check
    /// @return bool True if the module is included in current config
    function isModuleInCurrentConfig(address _module) external view returns (bool) {
        if (_module == address(0)) return false;
        
        for (uint256 i = 0; i < currentConfig.modules.length; i++) {
            if (currentConfig.modules[i] == _module) {
                return true;
            }
        }
        return false;
    }
} 