// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

import "../../interfaces/IERC20.sol";

/// @title MockMessageTransmitter - Minimal mock for CCTP send and receive
/// @notice Stores deposit inputs and mints on receiveMessage; no hook callbacks
contract MockMessageTransmitter {
	address public immutable USDC;
	
	uint64 private messageNonce = 1;
	
	struct StoredMessage {
		uint256 amount;
		address mintRecipient;
		address destinationCaller;
		bytes hookData;
		uint32 sourceDomain;
		uint32 destinationDomain;
		bool exists;
	}
	
	mapping(uint64 => StoredMessage) public storedMessages;
	uint64 public latestStoredNonce;
	
	constructor(address _usdc) {
		USDC = _usdc;
	}
	
	/// @notice Simulates CCTP receiveMessage
	/// @dev Mints stored amount to recipient and returns true on success
    function receiveMessage(bytes calldata message, bytes calldata /* attestation */) external returns (bool) {
		bytes32 nonceBytes;
		assembly {
			nonceBytes := calldataload(add(message.offset, 12))
		}
		uint64 nonce = uint64(uint256(nonceBytes));
		StoredMessage memory m = storedMessages[nonce];
		require(m.exists, "MockMessageTransmitter: No message");
		IERC20(USDC).transfer(m.mintRecipient, m.amount);
		return true;
	}

	/// @notice Simulates TokenMessenger.depositForBurn - captures data for later receive
	function depositForBurn(
		uint256 amount,
		uint32 destinationDomain,
		bytes32 mintRecipient,
		address burnToken,
		bytes32 destinationCaller,
		uint256 /* maxFee */,
		uint32 /* minFinalityThreshold */
	) external {
		require(burnToken == USDC, "MockMessageTransmitter: USDC only");
		require(amount > 0, "MockMessageTransmitter: amount=0");
		IERC20(USDC).transferFrom(msg.sender, address(this), amount);
		uint64 nonce = messageNonce++;
		storedMessages[nonce] = StoredMessage({
			amount: amount,
			mintRecipient: address(uint160(uint256(mintRecipient))),
			destinationCaller: address(uint160(uint256(destinationCaller))),
			hookData: "",
			sourceDomain: 1,
			destinationDomain: destinationDomain,
			exists: true
		});
		latestStoredNonce = nonce;
	}
	
	/// @notice Simulates TokenMessenger.depositForBurnWithHook - captures data for later receive
    function depositForBurnWithHook(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 /* maxFee */, 
        uint32 /* minFinalityThreshold */, 
        bytes calldata hookData
    ) external {
		require(burnToken == USDC, "MockMessageTransmitter: USDC only");
		require(amount > 0, "MockMessageTransmitter: amount=0");
		IERC20(USDC).transferFrom(msg.sender, address(this), amount);
		uint64 nonce = messageNonce++;
		storedMessages[nonce] = StoredMessage({
			amount: amount,
			mintRecipient: address(uint160(uint256(mintRecipient))),
			destinationCaller: address(uint160(uint256(destinationCaller))),
			hookData: hookData,
			sourceDomain: 1,
			destinationDomain: destinationDomain,
			exists: true
		});
		latestStoredNonce = nonce;
	}
	
	/// @notice Helper: build a minimal CCTP V2 message with correct structure for CCTPBundleReceiver
	/// @dev CCTPBundleReceiver expects: 148-byte header + 228-byte BurnMessageV2 + hookData (total 376 bytes before hook)
	///      Amount is placed at offset 68 within BurnMessage (= offset 216 in the full message).
	function buildMessageWithHook(uint64 nonce) external view returns (bytes memory message) {
		StoredMessage memory m = storedMessages[nonce];
		require(m.exists, "MockMessageTransmitter: No message");
		// CCTP V2 Message Header (148 bytes)
		bytes memory header = abi.encodePacked(
			uint32(1),                    // version (4 bytes)
			uint32(m.sourceDomain),       // sourceDomain (4 bytes)
			uint32(m.destinationDomain),  // destinationDomain (4 bytes)
			bytes32(uint256(nonce))       // nonce (32 bytes)
		); // = 44 bytes
		// Pad to 148 bytes (header size)
		bytes memory paddedHeader = new bytes(148);
		for (uint i = 0; i < 44 && i < 148; i++) {
			paddedHeader[i] = header[i];
		}
		// BurnMessageV2 fixed fields (228 bytes)
		// Amount lives at offset 68 within BurnMessage (version(4) + burnToken(32) + mintRecipient(32) = 68)
		bytes memory burnMessage = new bytes(228);
		bytes32 amountBytes = bytes32(m.amount);
		for (uint i = 0; i < 32; i++) {
			burnMessage[68 + i] = amountBytes[i];
		}
		// Concatenate: 148-byte header + 228-byte burn message + hookData
		return bytes.concat(paddedHeader, burnMessage, m.hookData);
	}
	
	function getStoredMessage(uint64 nonce) external view returns (uint256, address, address, bytes memory) {
		StoredMessage memory m = storedMessages[nonce];
		require(m.exists, "MockMessageTransmitter: No message");
		return (m.amount, m.mintRecipient, m.destinationCaller, m.hookData);
	}
	
	function getNextNonce() external view returns (uint64) { return messageNonce; }
} 