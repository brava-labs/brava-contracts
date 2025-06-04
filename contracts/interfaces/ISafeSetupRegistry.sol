// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title ISafeSetupRegistry
/// @notice Interface for managing Safe setup configurations
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
interface ISafeSetupRegistry {
    /// @notice Configuration for Safe setup
    struct SafeSetupConfig {
        address fallbackHandler;
        address[] modules;
        address guard;
        bool isActive;
    }

    /// @notice Emitted when a new setup configuration is proposed
    event SetupConfigProposed(bytes32 indexed configId, address fallbackHandler, address[] modules, address guard);

    /// @notice Emitted when a setup configuration proposal is canceled
    event SetupConfigCanceled(bytes32 indexed configId);

    /// @notice Emitted when a setup configuration is approved
    event SetupConfigApproved(bytes32 indexed configId, address fallbackHandler, address[] modules, address guard);

    /// @notice Emitted when a setup configuration is revoked
    event SetupConfigRevoked(bytes32 indexed configId);

    /// @notice Proposes a new Safe setup configuration
    /// @param _configId Unique identifier for the configuration
    /// @param _fallbackHandler Address of the fallback handler contract
    /// @param _modules Array of module addresses to enable
    /// @param _guard Address of the guard contract
    function proposeSetupConfig(
        bytes32 _configId,
        address _fallbackHandler,
        address[] calldata _modules,
        address _guard
    ) external;

    /// @notice Cancels a proposed setup configuration
    /// @param _configId Unique identifier for the configuration
    function cancelSetupConfig(bytes32 _configId) external;

    /// @notice Approves a proposed setup configuration
    /// @param _configId Unique identifier for the configuration
    function approveSetupConfig(bytes32 _configId) external;

    /// @notice Revokes an active setup configuration
    /// @param _configId Unique identifier for the configuration
    function revokeSetupConfig(bytes32 _configId) external;

    /// @notice Gets the current active setup configuration
    /// @param _configId Unique identifier for the configuration
    /// @return config The setup configuration
    function getSetupConfig(bytes32 _configId) external view returns (SafeSetupConfig memory config);

    /// @notice Checks if a setup configuration is active and approved
    /// @param _configId Unique identifier for the configuration
    /// @return bool True if the configuration is active, false otherwise
    function isApprovedConfig(bytes32 _configId) external view returns (bool);

    /// @notice Gets the proposal timestamp for a configuration
    /// @param _configId Unique identifier for the configuration
    /// @return uint256 The proposal timestamp (0 if not proposed)
    function getProposalTimestamp(bytes32 _configId) external view returns (uint256);
} 