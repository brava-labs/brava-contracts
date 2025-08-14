// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../../interfaces/IERC20.sol";

/// @title MockMessageTransmitter - Realistic mock for testing CCTP send and receive functionality
/// @notice Simulates both TokenMessenger (send) and MessageTransmitter (receive) for complete CCTP testing
contract MockMessageTransmitter {
    address public immutable USDC;
    
    uint64 private messageNonce = 1;
    
    // Simplified storage for captured send data - just what we need for testing
    struct StoredMessage {
        uint256 amount;
        address mintRecipient;
        address destinationCaller;
        bytes hookData;
        uint32 sourceDomain;
        bool exists;
    }
    
    mapping(uint64 => StoredMessage) public storedMessages;
    uint64 public latestStoredNonce;
    
    constructor(address _usdc) {
        USDC = _usdc;
    }
    
    event MessageReceived(
        address indexed caller,
        uint32 sourceDomain, 
        uint64 nonce,
        bytes32 sender,
        bytes messageBody
    );
    
    event USDCMinted(address indexed recipient, uint256 amount);
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
    
    /// @notice Simulates CCTP receiveMessage function - simplified for testing
    /// @param message The CCTP message bytes (we just extract the nonce)
    function receiveMessage(bytes calldata message, bytes calldata /* attestation */) external returns (bool success) {
        // For simplicity, just extract the nonce from the message to look up stored data
        // The nonce is at bytes 12-44 in the CCTP message format
        bytes32 nonceBytes;
        assembly {
            nonceBytes := calldataload(add(message.offset, 12))
        }
        uint64 nonce = uint64(uint256(nonceBytes));
        
        // Look up the stored data
        StoredMessage memory storedMsg = storedMessages[nonce];
        require(storedMsg.exists, "MockMessageTransmitter: No message stored for nonce");
        
        emit MessageReceived(msg.sender, storedMsg.sourceDomain, nonce, bytes32(uint256(uint160(msg.sender))), storedMsg.hookData);
        
        // 1. Transfer USDC to recipient (simulates minting)
        IERC20(USDC).transfer(storedMsg.mintRecipient, storedMsg.amount);
        emit USDCMinted(storedMsg.mintRecipient, storedMsg.amount);
        
        // 2. Execute hook if present
        if (storedMsg.hookData.length > 0 && storedMsg.destinationCaller != address(0)) {
            // Use the real CCTP interface: handleReceiveFinalizedMessage
            (bool ok, ) = storedMsg.destinationCaller.call(
                abi.encodeWithSignature(
                    "handleReceiveFinalizedMessage(uint32,bytes32,uint32,bytes)",
                    storedMsg.sourceDomain,
                    bytes32(uint256(uint160(msg.sender))), // sender as bytes32
                    uint32(1000), // finalityThresholdExecuted
                    storedMsg.hookData // Pass hookData as messageBody
                )
            );
            ok; // silence unused local variable warning
        }
        
        return true;
    }
    

    
    /// @notice Simulates TokenMessenger.depositForBurnWithHook - captures send data for testing
    /// @param amount Amount to burn and bridge
    /// @param destinationDomain Destination domain ID
    /// @param mintRecipient Address to mint tokens to on destination
    /// @param burnToken Token to burn (should be USDC)
    /// @param destinationCaller Address that can call receiveMessage
    /// @param /* maxFee */ Maximum fee for fast transfer (unused in mock)
    /// @param /* minFinalityThreshold */ Finality threshold (unused in mock)
    /// @param hookData Hook data for destination execution
    /// @return nonce The message nonce
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 /* maxFee */,
        uint32 /* minFinalityThreshold */,
        bytes calldata hookData
    ) external returns (uint64 nonce) {
        
        require(burnToken == USDC, "MockMessageTransmitter: Only USDC supported");
        require(amount > 0, "MockMessageTransmitter: Amount must be > 0");
        
        // Transfer USDC from sender to this contract (simulates burn)
        IERC20(USDC).transferFrom(msg.sender, address(this), amount);
        
        // Create message nonce
        nonce = messageNonce++;
        
        // Store the essential data for later receiveMessage call
        storedMessages[nonce] = StoredMessage({
            amount: amount,
            mintRecipient: address(uint160(uint256(mintRecipient))),
            destinationCaller: address(uint160(uint256(destinationCaller))),
            hookData: hookData,
            sourceDomain: 1, // Default source domain for testing
            exists: true
        });
        
        latestStoredNonce = nonce;
        
        emit DepositForBurnWithHook(
            nonce,
            burnToken,
            amount,
            msg.sender,
            mintRecipient,
            destinationDomain,
            destinationCaller,
            hookData
        );
        
        return nonce;
    }
    

    
    /// @notice Replays a stored message through the receive flow
    /// @param nonce The nonce of the stored message to replay
    function receiveStoredMessage(uint64 nonce) external returns (bool success) {
        StoredMessage memory storedMsg = storedMessages[nonce];
        require(storedMsg.exists, "MockMessageTransmitter: No message stored for nonce");
        
        // Create a minimal message with just the nonce at the right position for receiveMessage
        bytes memory minimalMessage = abi.encodePacked(
            uint32(1),                      // version
            uint32(storedMsg.sourceDomain), // sourceDomain 
            uint32(1),                      // destinationDomain
            bytes32(uint256(nonce))         // nonce at bytes 12-44
        );
        
        // Call the receive flow with minimal message data
        return this.receiveMessage(minimalMessage, "");
    }
    
    /// @notice Get the latest stored message for easy testing
    function receiveLatestStoredMessage() external returns (bool success) {
        require(latestStoredNonce > 0, "MockMessageTransmitter: No messages stored");
        return this.receiveStoredMessage(latestStoredNonce);
    }
    
    /// @notice Get stored message info for inspection
    function getStoredMessage(uint64 nonce) external view returns (
        uint256 amount,
        address mintRecipient,
        address destinationCaller,
        bytes memory hookData
    ) {
        StoredMessage memory storedMsg = storedMessages[nonce];
        require(storedMsg.exists, "MockMessageTransmitter: No message stored for nonce");
        
        return (
            storedMsg.amount,
            storedMsg.mintRecipient,
            storedMsg.destinationCaller,
            storedMsg.hookData
        );
    }
    
    /// @notice Get the next nonce (for testing)
    function getNextNonce() external view returns (uint64) {
        return messageNonce;
    }
    

    
    /// @notice Helper to create hook data for bundle execution
    /// @param safeAddr Address of the Safe that will execute the bundle
    /// @param bundle Bundle containing sequences to execute
    /// @param signature Signature authorizing the bundle execution
    function createBundleHookData(
        address safeAddr,
        bytes calldata bundle, 
        bytes calldata signature
    ) external pure returns (bytes memory) {
        // This creates the hook data that CCTPBundleReceiver expects
        // The selector should match IEip712TypedDataSafeModule.executeBundle.selector
        return abi.encode(
            bytes4(0x83010be8), // executeBundle selector (calculated via hardhat ethers)
            safeAddr,           // Safe address
            bundle,             // Bundle data  
            signature           // Bundle signature
        );
    }
} 