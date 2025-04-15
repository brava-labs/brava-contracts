// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title ICCTP - Common interfaces for CCTP integration
/// @notice Contains all the necessary interfaces for interacting with CCTP v2 contracts
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers

/// @notice Interface for TokenMessengerV2
interface ITokenMessengerV2 {
    /// @notice Deposits and burns tokens to be minted on destination domain
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external;

    /// @notice Deposits and burns tokens with hook data to be executed on destination domain
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external;
}

/// @notice Interface for MessageTransmitterV2
interface IMessageTransmitterV2 {
    /// @notice Receives a message and its attestation
    function receiveMessage(
        bytes calldata message, 
        bytes calldata attestation
    ) external returns (bool success);
}

/// @notice Enum representing CCTP log types
enum CCTPLogType {
    BURN_TOKEN,
    MINT_TOKEN,
    SEND_MESSAGE
} 