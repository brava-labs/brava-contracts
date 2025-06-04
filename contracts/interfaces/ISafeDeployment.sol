// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title ISafeDeployment
/// @notice Interface for deploying and configuring Safe accounts deterministically
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
interface ISafeDeployment {
    // Struct definitions for typed data functionality
    struct ActionDefinition {
        string protocolName;
        uint8 actionType;
    }

    struct Sequence {
        string name;
        ActionDefinition[] actions;
        bytes4[] actionIds;
        bytes[] callData;
    }

    struct ChainSequence {
        uint256 chainId;
        uint256 sequenceNonce;
        Sequence sequence;
    }

    struct Bundle {
        uint256 expiry;
        ChainSequence[] sequences;
    }

    /// @notice Emitted when a Safe is successfully deployed and configured
    event SafeDeployed(
        address indexed userAddress,
        address indexed safeAddress,
        bytes32 indexed configId,
        uint256 saltNonce
    );

    /// @notice Emitted when a Safe is reconfigured
    event SafeReconfigured(
        address indexed userAddress,
        address indexed safeAddress,
        bytes32 indexed configId
    );

    /// @notice Emitted when a typed data bundle is executed
    event TypedDataBundleExecuted(
        address indexed userAddress, 
        address indexed safeAddress, 
        bool indexed wasDeployed
    );

    /// @notice Deploys and configures a Safe for a user
    /// @param _userAddress The address that will own the Safe
    /// @param _configId The configuration ID to use from the setup registry (for initial setup only)
    /// @return safeAddress The address of the deployed Safe
    function deploySafeForUser(
        address _userAddress,
        bytes32 _configId
    ) external returns (address safeAddress);

    /// @notice Reconfigures an existing Safe with a new approved configuration
    /// @param _userAddress The address that owns the Safe
    /// @param _configId The new configuration ID to apply
    function reconfigureSafe(
        address _userAddress,
        bytes32 _configId
    ) external;

    /// @notice Executes a typed data bundle, deploying Safe if needed
    /// @param _bundle The bundle containing sequences for multiple chains
    /// @param _signature EIP-712 signature from the intended Safe owner
    function executeTypedDataBundle(
        Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable;

    /// @notice Sets the EIP712TypedDataSafeModule address
    /// @param _moduleAddress The address of the EIP712TypedDataSafeModule
    function setEIP712TypedDataModule(address _moduleAddress) external;

    /// @notice Predicts the address of a Safe before deployment
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The predicted Safe address
    function predictSafeAddress(
        address _userAddress
    ) external view returns (address safeAddress);

    /// @notice Checks if a Safe is already deployed at the predicted address
    /// @param _userAddress The address that will own the Safe
    /// @return bool True if Safe is already deployed, false otherwise
    function isSafeDeployed(
        address _userAddress
    ) external view returns (bool);

    /// @notice Gets the Safe singleton address used for deployments
    /// @return address The Safe singleton address
    function getSafeSingleton() external view returns (address);

    /// @notice Gets the setup registry address
    /// @return address The setup registry address
    function getSetupRegistry() external view returns (address);
} 