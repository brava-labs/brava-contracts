// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

// Hook target and calldata are provided inside the attested message
import {Errors} from "../../Errors.sol";

// Minimal external interface for Circle MessageTransmitter V2
interface IMessageTransmitterV2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

/**
 * @title CCTPBundleReceiver
 * @notice Relays attested CCTP messages and best‑effort executes the embedded hook target
 * @dev Minimal surface and non‑atomic design: USDC mint is independent from hook execution.
 *      Permissionless by intent: any executor may call relay. If a low‑gas caller consumes the nonce
 *      without executing the hook, the bundle can still be executed directly on the module; in that case
 *      USDC has already been minted to the intended recipient.
 */
contract CCTPBundleReceiver {
    
    // MessageTransmitter contract - configurable for testing
    address public immutable MESSAGE_TRANSMITTER;
    
    // EIP712TypedDataSafeModule address recorded for observability; relay executes the attested hook target directly
    address public immutable EIP712_MODULE;
    
    
    // Events for monitoring and debugging
    event RelayAndHook(bytes32 indexed messageHash, bool relaySuccess, bool hookSuccess);
    
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
     * @notice Relay a CCTP V2 message and then attempt to execute the attested hook target with its calldata
     * @dev Permissionless by design: any caller can relay and trigger the best‑effort hook.
     *      - USDC mint is performed by Circle's transmitter if attestation is valid.
     *      - Hook execution is non‑atomic and not relied upon for fund safety.
     *        If a low‑gas caller consumes the nonce without executing the hook, the bundle can still
     *        be executed directly on the module; in such a case, USDC has already been minted.
     * @dev CCTP V2 message structure per Circle's BurnMessageV2.sol:
     *      - 148-byte header + BurnMessageV2 (228 fixed bytes: version, burnToken, mintRecipient, amount,
     *        messageSender, maxFee, feeExecuted, expirationBlock) + hookData (dynamic).
     *      - Hook data starts at byte 376 and format is: [20‑byte target][raw calldata].
     *      - Hook execution is best‑effort and does not revert on failure.
     * @param message Full CCTP V2 message bytes
     * @param attestation Circle attestation bytes
     * @return relaySuccess True if receiveMessage succeeded
     * @return hookSuccess True if the hook call succeeded (false if no hook or call failed)
     * @return hookReturnData Return data from hook target
     */
    function relay(
        bytes calldata message,
        bytes calldata attestation
    ) external returns (
        bool relaySuccess,
        bool hookSuccess,
        bytes memory hookReturnData
    ) {
        // Minimal format validation (version + minimum CCTP V2 message size)
        uint256 MIN_MESSAGE_SIZE = 376; // 148 header + 228 BurnMessageV2 fixed fields
        if (message.length < MIN_MESSAGE_SIZE) revert Errors.CCTPReceiver_BadMessage();
        uint32 version;
        assembly {
            // load first 32 bytes and shift right by 224 bits to keep only the first 4 bytes
            version := shr(224, calldataload(message.offset))
        }
        if (version != 1) revert Errors.CCTPReceiver_BadVersion(version);

        // Relay to Circle MessageTransmitter
        relaySuccess = IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(message, attestation);
        if (!relaySuccess) revert Errors.CCTPReceiver_RelayFailed();

        // Extract hook data from message tail and execute if present
        bytes memory hookData = _extractHookDataFromMessage(message);
        if (hookData.length >= 20) {
            address hookTarget = _bytesToAddress(hookData);
            bytes memory hookCall = _slice(hookData, 20, hookData.length - 20);
            (hookSuccess, hookReturnData) = hookTarget.call(hookCall);
        }

        emit RelayAndHook(keccak256(message), relaySuccess, hookSuccess);
    }

    // ========================= INTERNAL HELPERS =========================
    function _extractHookDataFromMessage(bytes calldata message) internal pure returns (bytes memory) {
        // CCTP V2 Message Format (per Circle's BurnMessageV2.sol):
        // Message Header: 148 bytes
        //   - version (4) + sourceDomain (4) + destinationDomain (4) + nonce (32)
        //   - sender (32) + recipient (32) + destinationCaller (32)
        //   - minFinalityThreshold (4) + finalityThresholdExecuted (4)
        // BurnMessageV2 (starts at byte 148): 228 fixed bytes + hookData
        //   - version (4) + burnToken (32) + mintRecipient (32) + amount (32)
        //   - messageSender (32) + maxFee (32) + feeExecuted (32) + expirationBlock (32)
        //   - hookData (dynamic, starts at byte 228 within BurnMessageV2)
        // Total offset: 148 + 228 = 376 bytes
        uint256 CCTP_HEADER_SIZE = 148;
        uint256 BURN_MESSAGE_FIXED_SIZE = 228;
        uint256 HOOK_DATA_OFFSET = CCTP_HEADER_SIZE + BURN_MESSAGE_FIXED_SIZE; // 376
        
        if (message.length <= HOOK_DATA_OFFSET) return bytes("");
        
        // Copy hook data from offset 376 (no length prefix, just raw [target][calldata])
        bytes memory out = new bytes(message.length - HOOK_DATA_OFFSET);
        assembly {
            calldatacopy(add(out, 32), add(message.offset, HOOK_DATA_OFFSET), sub(message.length, HOOK_DATA_OFFSET))
        }
        return out;
    }

    function _bytesToAddress(bytes memory data) internal pure returns (address addr) {
        if (data.length < 20) revert Errors.CCTPReceiver_ShortHook();
        assembly {
            addr := shr(96, mload(add(data, 32)))
        }
    }

    function _slice(bytes memory data, uint256 start, uint256 len) internal pure returns (bytes memory out) {
        if (data.length < start + len) revert Errors.CCTPReceiver_OutOfBounds();
        out = new bytes(len);
        assembly {
            let src := add(add(data, 32), start)
            let dst := add(out, 32)
            for { let i := 0 } lt(i, len) { i := add(i, 32) } {
                mstore(add(dst, i), mload(add(src, i)))
            }
        }
    }
}