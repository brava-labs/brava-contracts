// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity ^0.8.20;

import "../../interfaces/IERC20.sol";

/// @title MockMessageTransmitter - Minimal mock for CCTP send and receive
/// @notice Stores depositForBurnWithHook inputs and mints on receiveMessage; no hook callbacks
contract MockMessageTransmitter {
	address public immutable USDC;
	
	uint64 private messageNonce = 1;
	
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
	) external returns (uint64 nonce) {
		require(burnToken == USDC, "MockMessageTransmitter: USDC only");
		require(amount > 0, "MockMessageTransmitter: amount=0");
		IERC20(USDC).transferFrom(msg.sender, address(this), amount);
		nonce = messageNonce++;
		storedMessages[nonce] = StoredMessage({
			amount: amount,
			mintRecipient: address(uint160(uint256(mintRecipient))),
			destinationCaller: address(uint160(uint256(destinationCaller))),
			hookData: hookData,
			sourceDomain: 1,
			exists: true
		});
		latestStoredNonce = nonce;
	}
	
	/// @notice Helper: build a minimal CCTP message with header and embedded stored hookData
	function buildMessageWithHook(uint64 nonce) external view returns (bytes memory) {
		StoredMessage memory m = storedMessages[nonce];
		require(m.exists, "MockMessageTransmitter: No message");
		bytes memory header = abi.encodePacked(uint32(1), uint32(m.sourceDomain), uint32(1), bytes32(uint256(nonce)));
		return bytes.concat(header, m.hookData);
	}
	
	function getStoredMessage(uint64 nonce) external view returns (uint256, address, address, bytes memory) {
		StoredMessage memory m = storedMessages[nonce];
		require(m.exists, "MockMessageTransmitter: No message");
		return (m.amount, m.mintRecipient, m.destinationCaller, m.hookData);
	}
	
	function getNextNonce() external view returns (uint64) { return messageNonce; }
} 