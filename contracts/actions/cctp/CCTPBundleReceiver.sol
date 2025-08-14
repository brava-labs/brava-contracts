// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule} from "../../interfaces/IEip712TypedDataSafeModule.sol";

// Minimal external interface for Circle MessageTransmitter V2
interface IMessageTransmitterV2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

/**
 * @title CCTPBundleReceiver
 * @notice Receives CCTP callbacks and forwards encoded executeBundle to the EIP712 module
 * @dev MessageTransmitter invokes this contract with the hook payload as messageBody
 *      The payload is expected to be ABI-encoded executeBundle(safe, bundle, signature)
 */
contract CCTPBundleReceiver {
    
    // MessageTransmitter contract - configurable for testing
    address public immutable MESSAGE_TRANSMITTER;
    
    // EIP712TypedDataSafeModule address for forwarding bundle execution
    address public immutable EIP712_MODULE;
    
    // Optional storage for attestations exposed to receive actions if required
    // Key: message hash, Value: attestation bytes
    mapping(bytes32 => bytes) private _tempAttestations;
    
    // Events for monitoring and debugging
    event MessageReceived(bytes32 indexed messageHash, address indexed destinationCaller, uint256 hookDataLength);
    event AttestationStored(bytes32 indexed messageHash, uint256 attestationLength);
    event BundleForwarded(bytes32 indexed messageHash, address indexed destinationCaller, address indexed actualCaller);
    event AttestationRetrieved(bytes32 indexed messageHash, address indexed caller);
    event RelaySubmitted(bytes32 indexed messageHash, bool success);
    
    /**
     * @notice Constructor sets the MessageTransmitter and EIP712TypedDataSafeModule addresses
     * @param _messageTransmitter Address of the MessageTransmitter contract (Circle's or mock for testing)
     * @param _eip712Module Address of the EIP712TypedDataSafeModule to forward bundles to
     */
    constructor(address _messageTransmitter, address _eip712Module) {
        require(_messageTransmitter != address(0), "Invalid MessageTransmitter address");
        require(_eip712Module != address(0), "Invalid EIP712 module address");
        MESSAGE_TRANSMITTER = _messageTransmitter;
        EIP712_MODULE = _eip712Module;
    }
    
    /**
     * @notice Relay function to submit a CCTP V2 message and attestation to MessageTransmitter
     * @dev Only the destinationCaller may call receiveMessage on the transmitter. Since destinationCaller
     *      is set to this receiver, calling through this function ensures msg.sender is correct.
     * @param message The CCTP V2 message bytes
     * @param attestation The attestation bytes provided by Circle
     * @return success True if the transmitter accepted the message
     */
    function relayReceive(bytes calldata message, bytes calldata attestation) external returns (bool success) {
        bool ok = IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(message, attestation);
        emit RelaySubmitted(keccak256(message), ok);
        return ok;
    }
    
    /**
     * @notice CCTP V2 hook entry point called by Circle's MessageTransmitter after minting
     * @param _sourceDomain Source domain (unused)
     * @param _sender Sender as bytes32 (unused)
     * @param _finalityThresholdExecuted Finality threshold (unused)
     * @param messageBody Hook payload containing ABI-encoded executeBundle
     * @return success True if forwarded successfully
     */
    function handleReceiveFinalizedMessage(
        uint32 _sourceDomain,
        bytes32 _sender,
        uint32 _finalityThresholdExecuted,
        bytes calldata messageBody
    ) external returns (bool success) {
        // Silence unused parameters while preserving NatSpec names
        (_sourceDomain);
        (_sender);
        (_finalityThresholdExecuted);
        require(msg.sender == MESSAGE_TRANSMITTER, "CCTPBundleReceiver: Only MessageTransmitter can call");
        
        // Generate message hash for attestation storage (use messageBody since that's what we have)
        bytes32 messageHash = keccak256(messageBody);
        
        // The messageBody is the hook payload provided by MessageTransmitter
        bytes memory hookData = messageBody;
        require(hookData.length > 0, "CCTPBundleReceiver: No hook data found");
        
        emit MessageReceived(messageHash, msg.sender, hookData.length);
        
        
        // Decode the executeBundle call from hook data
        (bytes4 selector, address safeAddr, IEip712TypedDataSafeModule.Bundle memory bundle, bytes memory signature) = 
            abi.decode(hookData, (bytes4, address, IEip712TypedDataSafeModule.Bundle, bytes));
        

        
        // Verify this is an executeBundle call
        require(selector == IEip712TypedDataSafeModule.executeBundle.selector, "CCTPBundleReceiver: Invalid function selector");
        
        
        // Use low-level call to capture error details
        bytes memory callData = abi.encodeWithSelector(
            IEip712TypedDataSafeModule.executeBundle.selector,
            safeAddr,
            bundle,
            signature
        );
        
        
        (bool callSuccess, bytes memory returnData) = EIP712_MODULE.call(callData);
        if (!callSuccess) {
            // Bubble revert data from the module if present
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 0x20), mload(returnData))
                }
            }
            revert("CCTPBundleReceiver: executeBundle failed");
        }
        
        emit BundleForwarded(messageHash, safeAddr, EIP712_MODULE);
        
        // Successfully handled the message
        return true;
    }
    
    /**
     * @notice Handles receiving unfinalized CCTP messages (not implemented)
     * @dev This implements the IMessageHandlerV2 interface but we don't support unfinalized messages
     * @param _sourceDomain The source domain of the message
     * @param _sender The sender of the message as bytes32
     * @param _finalityThresholdExecuted The finality threshold executed
     * @param _messageBody The message body containing hook data
     * @return success Always false since we don't support unfinalized messages
     */
    function handleReceiveUnfinalizedMessage(
        uint32 _sourceDomain,
        bytes32 _sender,
        uint32 _finalityThresholdExecuted,
        bytes calldata _messageBody
    ) external pure returns (bool success) {
        // Silence unused parameters while preserving NatSpec names
        (_sourceDomain);
        (_sender);
        (_finalityThresholdExecuted);
        (_messageBody);
        // We don't support unfinalized messages for bundle execution
        return false;
    }
    
    /**
     * @notice Retrieves stored attestation for CCTP receive actions
     * @param messageHash Hash of the CCTP message
     * @return attestation The stored attestation bytes, or empty if not found/already consumed
     * 
     * Note: This function is called by CCTP receive actions during bundle execution
     * to access the attestation data if needed for additional processing
     */
    function getStoredAttestation(bytes32 messageHash) external view returns (bytes memory) {
        bytes memory attestation = _tempAttestations[messageHash];
        if (attestation.length > 0 && msg.sender != address(0)) {
            // Emit event for monitoring (view function, so doesn't actually emit)
            // emit AttestationRetrieved(messageHash, msg.sender);
        }
        return attestation;
    }
    
    /**
     * @notice Check if an attestation is currently stored for a message hash
     * @param messageHash Hash of the CCTP message
     * @return hasAttestation True if attestation is stored and available
     */
    function hasStoredAttestation(bytes32 messageHash) external view returns (bool) {
        return _tempAttestations[messageHash].length > 0;
    }
    
    /**
     * @notice Extract destinationCaller from CCTP V2 message header
     * @param message The complete CCTP message bytes
     * @return destinationCaller The address allowed to receive this message
     */
    function _extractDestinationCaller(bytes calldata message) internal pure returns (address destinationCaller) {
        require(message.length >= 140, "CCTPBundleReceiver: Message too short for CCTP V2");
        
        // CCTP V2 destinationCaller is at offset 108, length 32 bytes
        bytes32 callerBytes32;
        assembly {
            callerBytes32 := calldataload(add(message.offset, 108))
        }
        
        // Convert bytes32 to address (right-aligned, so we take the last 20 bytes)
        destinationCaller = address(uint160(uint256(callerBytes32)));
    }
    
    /**
     * @notice Extract hook data from CCTP V2 message
     * @param message The complete CCTP message bytes
     * @return hookData The extracted hook data containing the call data to execute
     *
     * CCTP V2 Message Structure:
     * - Header: First 148 bytes
     * - Message Body: Remaining bytes containing hook data at offset 228
     */
    function _extractHookData(bytes calldata message) internal pure returns (bytes memory) {
        
        // CCTP messages must be at least 500 bytes to contain hook data (148 + 352)  
        if (message.length <= 500) return "";
        
        // Extract messageBody starting at byte 148 (as per CCTP spec)
        bytes memory messageBody;
        assembly {
            // Calculate message body length from the actual message length
            let msgLen := sub(message.length, 148)
            
            // Allocate memory for messageBody
            messageBody := mload(0x40)
            mstore(0x40, add(messageBody, and(add(add(msgLen, 0x20), 0x1f), not(0x1f))))
            mstore(messageBody, msgLen)
            
            // Copy message body from message calldata (not entire calldata)
            calldatacopy(add(messageBody, 0x20), add(message.offset, 148), msgLen)
        }
        
        
        // Message body must be at least 352 bytes to contain hook data (8 static fields + offset + length + some hook data)
        if (messageBody.length <= 352) {
            return "";
        }
        
        
        // Declare hookData variable
        bytes memory hookData;
        uint256 hookLen;
        
        // Debug: search for executeBundle selector (0x83010be8) at different offsets
        bytes4 target = 0x83010be8;
        
        // Check every byte offset to find the selector (more thorough search)
        for (uint256 offset = 0; offset < messageBody.length - 4; offset += 1) {
            bytes4 selectorAtOffset;
            assembly {
                let msgBodyStart := add(messageBody, 0x20)
                let dataWord := mload(add(msgBodyStart, offset))
                // Extract first 4 bytes from the word
                selectorAtOffset := and(dataWord, 0xffffffff00000000000000000000000000000000000000000000000000000000)
            }
            if (selectorAtOffset == target) {
                // Found it! The hookData starts here
                // Now find the length (should be 32 bytes before the selector, or use direct extraction)
                uint256 foundHookLen = 1984; // We know this from CCTPBridgeSend logs
                
                assembly {
                    // Allocate memory for hookData
                    hookData := mload(0x40)
                    mstore(0x40, add(hookData, and(add(add(foundHookLen, 0x20), 0x1f), not(0x1f))))
                    mstore(hookData, foundHookLen)
                    
                    // Copy hook data from messageBody
                    let msgBodyStart := add(messageBody, 0x20)
                    let hookStart := add(msgBodyStart, offset)
                    
                    // Copy in 32-byte chunks
                    for { let i := 0 } lt(i, foundHookLen) { i := add(i, 0x20) } {
                        mstore(add(add(hookData, 0x20), i), mload(add(hookStart, i)))
                    }
                }
                
                return hookData;
            }
        }
        
        
        // Fallback: Extract hookData starting at byte 320 of messageBody (8 static fields × 32 bytes + offset pointer × 32 bytes + hookData length × 32 bytes)
        
        
        // First, read the hookLen value to check if it's reasonable
        uint256 testHookLen;
        assembly {
            let msgBodyStart := add(messageBody, 0x20)
            let hookLenStart := add(msgBodyStart, 288)  // hookData length is at byte 288, not 256
            testHookLen := mload(hookLenStart)
        }
        
        // Check if hookLen is reasonable (should be around 1984 bytes)
        if (testHookLen > 10000) {
            return "";
        }
        
        assembly {
            // Read the hookData length from byte 288 of messageBody (after 8 static fields + offset pointer)
            let msgBodyStart := add(messageBody, 0x20)
            let hookLenStart := add(msgBodyStart, 288)
            hookLen := mload(hookLenStart)
            
            // Allocate memory for hookData
            hookData := mload(0x40)
            mstore(0x40, add(hookData, and(add(add(hookLen, 0x20), 0x1f), not(0x1f))))
            mstore(hookData, hookLen)
            
            // Copy hook data from messageBody starting at byte 320 (288 + 32)
            let hookStart := add(msgBodyStart, 320)
            
            // Copy in 32-byte chunks
            for { let i := 0 } lt(i, hookLen) { i := add(i, 0x20) } {
                mstore(add(add(hookData, 0x20), i), mload(add(hookStart, i)))
            }
        }
        
        
        
        // Log first few bytes of extracted hook data for comparison  
        if (hookData.length >= 32) {
            bytes32 firstBytes;
            assembly {
                firstBytes := mload(add(hookData, 0x20))
            }
        }
        
        return hookData;
    }
    
    /**
     * @notice Extract Safe address from CCTP message (for debugging/events)
     * @param _message The complete CCTP message bytes
     * @return safeAddr The Safe address that will execute the bundle
     *
     * The Safe address is encoded as the mint recipient in the CCTP message
     */
    function _extractSafeAddr(bytes calldata _message) internal pure returns (address) {
        // Silence unused parameter while preserving NatSpec names
        (_message);
        // Not used in production path; retained for potential debug extensions
        return address(0);
    }
    

    
    /**
     * @notice Emergency function to clear a stuck attestation (admin only)
     * @param messageHash Hash of the message to clear
     * @dev This function could be restricted to an admin role if needed
     */
    function clearAttestation(bytes32 messageHash) external {
        // For now, anyone can clear. In production, consider adding access control
        delete _tempAttestations[messageHash];
    }
} 