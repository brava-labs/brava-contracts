// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title ISafeDeployment
/// @notice Interface for deploying Safe accounts with current configuration from registry
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/// @author BravaLabs.xyz
interface ISafeDeployment {
    /// @notice Emitted when a Safe is successfully deployed and configured
    event SafeDeployed(
        address indexed userAddress,
        address indexed safeAddress
    );

    /// @notice Deploys a Safe with the current configuration from the registry
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The address of the deployed Safe
    function deploySafe(address _userAddress) external returns (address safeAddress);

    /// @notice Predicts the address of a Safe before deployment
    /// @param _userAddress The address that will own the Safe
    /// @return safeAddress The predicted Safe address
    function predictSafeAddress(address _userAddress) external view returns (address safeAddress);

    /// @notice Checks if a Safe is already deployed at the predicted address
    /// @param _userAddress The address that will own the Safe
    /// @return bool True if Safe is already deployed, false otherwise
    function isSafeDeployed(address _userAddress) external view returns (bool);

    /// @notice Gets the Safe singleton address used for deployments
    /// @return address The Safe singleton address
    function getSafeSingleton() external view returns (address);

    /// @notice Gets the setup registry address
    /// @return address The setup registry address
    function getSetupRegistry() external view returns (address);
} 