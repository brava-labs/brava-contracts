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
}
