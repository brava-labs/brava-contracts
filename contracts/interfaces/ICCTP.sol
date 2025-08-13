// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ITokenMessengerV2 - CCTP V2 Token Messenger interface
/// @notice Interface for Circle's CCTP V2 Token Messenger contract
interface ITokenMessengerV2 {
    /// @notice Event emitted when tokens are deposited for burn with hook
    /// @param nonce Unique nonce for the message
    /// @param burnToken The token being burned
    /// @param amount Amount of tokens burned
    /// @param depositor Address that initiated the deposit
    /// @param mintRecipient Address that will receive tokens on destination chain
    /// @param destinationDomain Destination domain ID
    /// @param destinationCaller Address that can call receiveMessage on destination
    /// @param hookData Hook data to be embedded in the CCTP message
    event DepositForBurnWithHook(
        uint64 indexed nonce,
        address indexed burnToken,
        uint256 amount,
        address indexed depositor,
        bytes32 mintRecipient,
        uint32 destinationDomain,
        bytes32 destinationCaller,
        bytes hookData
    );

    /// @notice Deposit tokens for burning without hook data
    /// @param amount Amount to burn
    /// @param destinationDomain Destination domain ID
    /// @param mintRecipient Address to mint tokens to on destination
    /// @param burnToken Token to burn
    /// @param destinationCaller Address that can call receiveMessage
    /// @param maxFee Maximum fee for fast transfer
    /// @param minFinalityThreshold Minimum finality threshold
    /// @return nonce The nonce of the burn message
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external returns (uint64 nonce);

    /// @notice Deposit tokens for burning with hook data
    /// @param amount Amount to burn
    /// @param destinationDomain Destination domain ID
    /// @param mintRecipient Address to mint tokens to on destination
    /// @param burnToken Token to burn
    /// @param destinationCaller Address that can call receiveMessage
    /// @param maxFee Maximum fee for fast transfer
    /// @param minFinalityThreshold Minimum finality threshold
    /// @param hookData Hook data to embed in CCTP message
    /// @return nonce The nonce of the burn message
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold,
        bytes calldata hookData
    ) external returns (uint64 nonce);
} 