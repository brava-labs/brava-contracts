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
    

    // Events for monitoring and debugging
    event MessageReceived(bytes32 indexed messageHash, address indexed destinationCaller, uint256 hookDataLength);
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
        
        // Sanity check safe address
        require(safeAddr != address(0), "CCTPBundleReceiver: invalid safe");

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
    
} 