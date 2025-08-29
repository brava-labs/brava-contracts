// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

/// @title ISafeSetupRegistry
/// @notice Interface for managing the current Safe setup configuration
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
interface ISafeSetupRegistry {
    /// @notice Safe setup configuration structure
    struct SafeSetupConfig {
        address fallbackHandler;
        address[] modules;
        address guard;
    }

    /// @notice Emitted when the current configuration is updated
    event CurrentConfigurationUpdated(
        address fallbackHandler,
        address[] modules,
        address guard
    );

    /// @notice Gets the current active setup configuration
    /// @return config The current setup configuration
    function getCurrentConfig() external view returns (SafeSetupConfig memory config);

    /// @notice Updates the current setup configuration
    /// @param _fallbackHandler Address of the fallback handler contract
    /// @param _modules Array of module addresses to enable
    /// @param _guard Address of the guard contract
    function updateCurrentConfig(
        address _fallbackHandler,
        address[] calldata _modules,
        address _guard
    ) external;

    /// @notice Checks if the current configuration includes a specific module
    /// @param _module The module address to check
    /// @return bool True if the module is included in current config
    function isModuleInCurrentConfig(address _module) external view returns (bool);
} 