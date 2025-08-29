// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

/// @title IEip712TypedDataSafeModule
/// @notice Interface for EIP712TypedDataSafeModule contract to enable Bundle execution
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
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
        address refundToken;
        uint256 maxRefundAmount;
        uint8 refundRecipient; // 0=executor, 1=fee recipient
        Sequence sequence;
    }

    /// @notice Bundle structure containing multiple chain sequences
    struct Bundle {
        uint256 expiry;
        ChainSequence[] sequences;
    }

    /// @notice Executes a validated bundle for the current chain and nonce
    /// @param _safeAddr The Safe address to execute on
    /// @param _bundle The bundle containing sequences for multiple chains
    /// @param _signature EIP-712 signature from a Safe owner
    function executeBundle(
        address _safeAddr,
        Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable;

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

    /// @notice Events emitted by the module
    event BundleExecuted(address indexed safe, uint256 indexed expiry, uint256 indexed chainId, uint256 sequenceNonce);
    event SignatureVerified(address indexed safe, address indexed signer, bytes32 indexed bundleHash);
    event SafeDeployedForExecution(address indexed signer, address indexed safeAddress);
    event GasRefundProcessed(address indexed safe, address indexed refundToken, uint256 refundAmount, address indexed recipient);
} 