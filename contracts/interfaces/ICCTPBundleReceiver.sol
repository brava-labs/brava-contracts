// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/**
 * @title ICCTPBundleReceiver
 * @notice Interface for the CCTPBundleReceiver contract
 * @dev Defines the interface for CCTP receive actions to access stored attestations
 */
interface ICCTPBundleReceiver {
    
    /**
     * @notice Retrieves stored attestation for CCTP receive actions
     * @param messageHash Hash of the CCTP message
     * @return attestation The stored attestation bytes, or empty if not found/already consumed
     */
    function getStoredAttestation(bytes32 messageHash) external view returns (bytes memory);
    
    /**
     * @notice Check if an attestation is currently stored for a message hash
     * @param messageHash Hash of the CCTP message
     * @return hasAttestation True if attestation is stored and available
     */
    function hasStoredAttestation(bytes32 messageHash) external view returns (bool);
    
    /**
     * @notice Get the EIP712TypedDataSafeModule address this receiver forwards to
     * @return moduleAddress The EIP712 module address
     */
    function getEIP712Module() external view returns (address);
    
    /**
     * @notice Emergency function to clear a stuck attestation
     * @param messageHash Hash of the message to clear
     */
    function clearAttestation(bytes32 messageHash) external;
    
    // Events
    event MessageReceived(bytes32 indexed messageHash, address indexed safeAddr, uint256 hookDataLength);
    event AttestationStored(bytes32 indexed messageHash, uint256 attestationLength);
    event BundleForwarded(bytes32 indexed messageHash, address indexed safeAddr, address indexed eip712Module);
    event AttestationRetrieved(bytes32 indexed messageHash, address indexed caller);
}
