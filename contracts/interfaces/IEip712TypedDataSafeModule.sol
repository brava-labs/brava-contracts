// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IEip712TypedDataSafeModule
/// @notice Interface for EIP712TypedDataSafeModule contract to enable Bundle execution
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
interface IEip712TypedDataSafeModule {

    /// @notice Action definition structure
    struct ActionDefinition {
        string protocolName;
        uint8 actionType;
    }

    /// @notice Sequence structure containing actions and calldata
    struct Sequence {
        string name;
        ActionDefinition[] actions;
        bytes4[] actionIds;
        bytes[] callData;
    }

    /// @notice Chain sequence structure for multi-chain operations
    struct ChainSequence {
        uint256 chainId;
        uint256 sequenceNonce;
        bool deploySafe;
        bool enableGasRefund;
        uint256 maxRefundAmount;
        uint8 refundRecipient; // 0=executor, 1=fee recipient
        Sequence sequence;
    }

    /// @notice Per-manager restriction: limits which ActionType values a manager may execute.
    /// @dev Only restricted managers need entries. A manager absent from managerRestrictions is unrestricted.
    struct ManagerRestriction {
        address manager;
        uint8[] allowedActionTypes;
    }

    /// @notice Atomic auth config update applied via the bundle.
    /// @dev `newVersion == 0` is the no-update sentinel: all other fields are ignored.
    ///      Any non-zero `newVersion` triggers a snapshot replacement on the AuthRegistry,
    ///      which enforces version-monotonic semantics with idempotent equality.
    ///      Owner signs the full target auth config; the registry handles the atomic state transition.
    ///      Auth updates are NOT scoped to the bundle's chain sequences — the update applies on
    ///      EVERY chain the bundle is submitted to. This is by design: auth state is global per Safe,
    ///      and cross-chain propagation relies on the update being applied regardless of which chain's
    ///      sequence is executed.
    struct AuthUpdate {
        uint256 newVersion;
        address[] newManagers;
        address[] newCoSigners;
        uint256 managerCoSignThreshold;
        ManagerRestriction[] managerRestrictions;
    }

    /// @notice Bundle structure containing multiple chain sequences and an optional auth config update
    struct Bundle {
        uint256 expiry;
        ChainSequence[] sequences;
        AuthUpdate authUpdate;
    }

    /// @notice Executes a validated bundle for the current chain and nonce
    /// @param _safeAddr The Safe address to execute on
    /// @param _bundle The bundle containing sequences for multiple chains and an optional auth update
    /// @param _signatures Packed EIP-712 signatures sorted by signer address ascending
    function executeBundle(
        address _safeAddr,
        Bundle calldata _bundle,
        bytes calldata _signatures
    ) external;

    /// @notice Gets the next expected sequence nonce for a Safe
    /// @param _safeAddr Address of the Safe
    /// @return The next expected sequence nonce
    function getSequenceNonce(address _safeAddr) external view returns (uint256);

    /// @notice Gets the EIP-712 domain separator for a specific Safe address
    /// @param _safeAddr The Safe address to use as verifying contract
    /// @return The domain separator
    function getDomainSeparator(address _safeAddr) external view returns (bytes32);

    /// @notice Computes the EIP-712 hash for a bundle
    /// @param _safeAddr The Safe address to use as verifying contract
    /// @param _bundle The bundle to hash
    /// @return The EIP-712 hash that should be signed
    function getBundleHash(address _safeAddr, Bundle calldata _bundle) external view returns (bytes32);
}
