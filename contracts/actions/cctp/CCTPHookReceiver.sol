// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Errors} from "../../Errors.sol";
import {IMessageTransmitterV2} from "../../interfaces/ICCTP.sol";

/// @title CCTPHookReceiver - Contract for receiving CCTP v2 cross-chain messages with hooks
/// @notice This contract relays CCTP messages and executes hooks on the destination chain
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract CCTPHookReceiver is Ownable {
    /// @notice The local MessageTransmitterV2 contract
    IMessageTransmitterV2 public immutable messageTransmitter;

    /// @notice Event emitted when a message is relayed and a hook is executed
    /// @param caller Address that called relay
    /// @param hookTarget Target address for hook execution
    /// @param hookSuccess Whether the hook execution was successful
    /// @param hookReturnData The return data from the hook execution
    event MessageRelayed(
        address indexed caller,
        address indexed hookTarget,
        bool hookSuccess,
        bytes hookReturnData
    );

    /// @notice Constants for hook handling
    uint256 private constant ADDRESS_BYTE_LENGTH = 20;

    /// @notice Initializes the CCTPHookReceiver contract
    /// @param _messageTransmitter Address of the local MessageTransmitterV2 contract
    constructor(address _messageTransmitter) Ownable(msg.sender) {
        require(_messageTransmitter != address(0), "Message transmitter cannot be zero address");
        messageTransmitter = IMessageTransmitterV2(_messageTransmitter);
    }

    /// @notice Relays a message to the local MessageTransmitterV2 and executes the hook
    /// @param message The CCTP message to relay
    /// @param attestation The attestation for the message
    /// @return relaySuccess Whether the message relay was successful
    /// @return hookSuccess Whether the hook execution was successful
    /// @return hookReturnData The return data from the hook execution
    function relay(bytes calldata message, bytes calldata attestation)
        external
        returns (
            bool relaySuccess,
            bool hookSuccess,
            bytes memory hookReturnData
        )
    {
        // Relay message to message transmitter
        relaySuccess = messageTransmitter.receiveMessage(message, attestation);
        require(relaySuccess, "Message relay failed");

        // Extract and execute hook data if present
        if (message.length > 148) { // Message format has at least 148 bytes before messageBody
            bytes memory messageBody = _extractMessageBody(message);
            
            // Extract hook data
            (hookSuccess, hookReturnData) = _processHookData(messageBody);
            
            emit MessageRelayed(
                msg.sender,
                hookSuccess ? _extractTargetAddress(messageBody) : address(0),
                hookSuccess,
                hookReturnData
            );
        }
    }

    /// @notice Extracts the message body from a CCTP message
    /// @param message The CCTP message
    /// @return messageBody The extracted message body
    function _extractMessageBody(bytes memory message) internal pure returns (bytes memory messageBody) {
        require(message.length > 148, "Invalid message length");
        
        // Message body starts at position 148
        uint256 bodyLength = message.length - 148;
        messageBody = new bytes(bodyLength);
        
        for (uint256 i = 0; i < bodyLength; i++) {
            messageBody[i] = message[148 + i];
        }
    }

    /// @notice Processes hook data and executes the hook
    /// @param messageBody The message body containing hook data
    /// @return success Whether the hook execution was successful
    /// @return returnData The return data from the hook execution
    function _processHookData(bytes memory messageBody) internal returns (bool success, bytes memory returnData) {
        if (messageBody.length >= ADDRESS_BYTE_LENGTH) {
            address hookTarget = _extractTargetAddress(messageBody);
            bytes memory hookCalldata = _extractCalldata(messageBody);
            
            if (hookTarget != address(0)) {
                (success, returnData) = _executeHook(hookTarget, hookCalldata);
            }
        }
    }

    /// @notice Extracts the target address from the hook data
    /// @param messageBody The message body containing hook data
    /// @return targetAddress The extracted target address
    function _extractTargetAddress(bytes memory messageBody) internal pure returns (address targetAddress) {
        if (messageBody.length >= ADDRESS_BYTE_LENGTH) {
            assembly {
                targetAddress := mload(add(add(messageBody, 0x20), 0))
                // Clear upper 96 bits
                targetAddress := and(targetAddress, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            }
        }
    }

    /// @notice Extracts the calldata from the hook data
    /// @param messageBody The message body containing hook data
    /// @return hookCalldata The extracted calldata
    function _extractCalldata(bytes memory messageBody) internal pure returns (bytes memory hookCalldata) {
        if (messageBody.length > ADDRESS_BYTE_LENGTH) {
            uint256 calldataLength = messageBody.length - ADDRESS_BYTE_LENGTH;
            hookCalldata = new bytes(calldataLength);
            
            for (uint256 i = 0; i < calldataLength; i++) {
                hookCalldata[i] = messageBody[ADDRESS_BYTE_LENGTH + i];
            }
        } else {
            hookCalldata = new bytes(0);
        }
    }

    /// @notice Executes a hook by calling the target address with the provided calldata
    /// @param hookTarget The target address to call
    /// @param hookCalldata The calldata to use in the call
    /// @return success Whether the call was successful
    /// @return returnData The return data from the call
    function _executeHook(address hookTarget, bytes memory hookCalldata) 
        internal 
        returns (bool success, bytes memory returnData) 
    {
        (success, returnData) = hookTarget.call(hookCalldata);
        // Note: We don't revert if the hook execution fails to ensure the message is still processed
    }
} 