// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/**
 * @title ICCTPBundleReceiver
 * @notice Minimal interface for the CCTPBundleReceiver contract
 */
interface ICCTPBundleReceiver {
    
    /**
     * @notice Relay wrapper for MessageTransmitter.receiveMessage
     * @param message The CCTP message bytes
     * @param attestation The attestation bytes provided by Circle
     * @return success True if the transmitter accepted the message
     */
    function relayReceive(bytes calldata message, bytes calldata attestation) external returns (bool success);

    /**
     * @notice The EIP712 module address (auto-generated getter from public state)
     */
    function EIP712_MODULE() external view returns (address);
}
