// SPDX-License-Identifier: LicenseRef-Brava-Commercial-License-1.0
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule} from "../../interfaces/IEip712TypedDataSafeModule.sol";

// Minimal external interface for Circle MessageTransmitter V2
interface IMessageTransmitterV2 {
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

/**
 * @title CCTPBundleReceiver
 * @notice Submits attested CCTP messages and provides a permissionless hook executor for the EIP712 module
 * @dev Design favors minimal surface and non-atomic receive: USDC mint is independent from hook execution.
 *      Off-chain infra or any relayer may call `executeHook` with the same hook payload to complete execution.
 */
contract CCTPBundleReceiver {
    
    // MessageTransmitter contract - configurable for testing
    address public immutable MESSAGE_TRANSMITTER;
    
    // EIP712TypedDataSafeModule address for forwarding bundle execution
    address public immutable EIP712_MODULE;
    
    
    // Events for monitoring and debugging
    event RelaySubmitted(bytes32 indexed messageHash, bool success);
    event HookExecutionAttempt(bytes32 indexed hookHash, address indexed safe);
    event HookExecutionResult(bytes32 indexed hookHash, bool success);
    
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
     * @dev Permissionless. If successful, USDC is minted to the message's mint recipient. This function does
     *      not attempt to decode or execute hook data. Use `executeHook` to run the EIP712 bundle.
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
     * @notice Execute an encoded EIP712 bundle hook payload against the configured module
     * @dev Permissionless helper. The expected encoding is
     *      abi.encode(IEip712TypedDataSafeModule.executeBundle.selector, safe, bundle, signature)
     * @param hookData ABI-encoded payload for executeBundle
     * @return success True if the bundle executed successfully
     */
    function executeHook(bytes calldata hookData) external returns (bool success) {
        require(hookData.length > 4, "CCTPBundleReceiver: empty hook");

        (bytes4 selector, address safeAddr, IEip712TypedDataSafeModule.Bundle memory bundle, bytes memory signature) =
            abi.decode(hookData, (bytes4, address, IEip712TypedDataSafeModule.Bundle, bytes));

        require(selector == IEip712TypedDataSafeModule.executeBundle.selector, "CCTPBundleReceiver: bad selector");
        require(safeAddr != address(0), "CCTPBundleReceiver: invalid safe");

        bytes32 hookHash = keccak256(hookData);
        emit HookExecutionAttempt(hookHash, safeAddr);

        bytes memory callData = abi.encodeWithSelector(
            IEip712TypedDataSafeModule.executeBundle.selector,
            safeAddr,
            bundle,
            signature
        );

        (bool callSuccess, bytes memory returnData) = EIP712_MODULE.call(callData);
        if (!callSuccess) {
            emit HookExecutionResult(hookHash, false);
            if (returnData.length > 0) {
                assembly {
                    revert(add(returnData, 0x20), mload(returnData))
                }
            }
            revert("CCTPBundleReceiver: executeBundle failed");
        }

        emit HookExecutionResult(hookHash, true);
        return true;
    }
}