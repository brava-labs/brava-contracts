// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IMessageTransmitterV2
/// @notice Minimal external interface for Circle MessageTransmitter V2.
interface IMessageTransmitterV2 {
    /// @notice Receives and verifies a Circle-attested cross-chain message.
    /// @param message Encoded CCTP V2 message.
    /// @param attestation Circle attestation proving the message was finalized.
    /// @return success True when the transmitter accepts and consumes the message.
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);

    /// @notice Replay-protection map: 0 when the nonce is unconsumed, 1 once a message has been
    ///         received for it. Keyed by the CCTP V2 message nonce (bytes32 at message offset 12).
    /// @param nonce CCTP V2 message nonce.
    /// @return status 0 = unused, 1 = used.
    function usedNonces(bytes32 nonce) external view returns (uint256);
}
