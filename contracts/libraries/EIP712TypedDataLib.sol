// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule} from "../interfaces/IEip712TypedDataSafeModule.sol";

/// @title EIP712TypedDataLib
/// @notice External library for EIP-712 type strings, type hashes, and hashing helpers to keep module bytecode small
library EIP712TypedDataLib {
    // EIP-712 type strings
    string private constant ACTION_DEFINITION_TYPE = "ActionDefinition(string protocolName,uint8 actionType)";
    string private constant SEQUENCE_TYPE = "Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)";
    string private constant CHAIN_SEQUENCE_TYPE = "ChainSequence(uint256 chainId,uint256 sequenceNonce,bool deploySafe,bool enableGasRefund,uint256 maxRefundAmount,uint8 refundRecipient,Sequence sequence)ActionDefinition(string protocolName,uint8 actionType)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)";
    string private constant BUNDLE_TYPE = "Bundle(uint256 expiry,ChainSequence[] sequences)ActionDefinition(string protocolName,uint8 actionType)ChainSequence(uint256 chainId,uint256 sequenceNonce,bool deploySafe,bool enableGasRefund,uint256 maxRefundAmount,uint8 refundRecipient,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)";
    string private constant DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)";

    // Precomputed type hashes
    bytes32 private constant ACTION_DEFINITION_TYPEHASH = keccak256(abi.encodePacked(ACTION_DEFINITION_TYPE));
    bytes32 private constant SEQUENCE_TYPEHASH = keccak256(abi.encodePacked(SEQUENCE_TYPE));
    bytes32 private constant CHAIN_SEQUENCE_TYPEHASH = keccak256(abi.encodePacked(CHAIN_SEQUENCE_TYPE));
    bytes32 private constant BUNDLE_TYPEHASH = keccak256(abi.encodePacked(BUNDLE_TYPE));
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(abi.encodePacked(DOMAIN_TYPE));

    function hashActionDefinition(IEip712TypedDataSafeModule.ActionDefinition memory action) public pure returns (bytes32) {
        return keccak256(abi.encode(
            ACTION_DEFINITION_TYPEHASH,
            keccak256(bytes(action.protocolName)),
            action.actionType
        ));
    }

    function hashSequence(IEip712TypedDataSafeModule.Sequence memory sequence) public pure returns (bytes32) {
        bytes32[] memory actionHashes = new bytes32[](sequence.actions.length);
        for (uint256 i = 0; i < sequence.actions.length; i++) {
            actionHashes[i] = hashActionDefinition(sequence.actions[i]);
        }

        bytes32[] memory callDataHashes = new bytes32[](sequence.callData.length);
        for (uint256 i = 0; i < sequence.callData.length; i++) {
            callDataHashes[i] = keccak256(sequence.callData[i]);
        }

        bytes32[] memory actionIdWords = new bytes32[](sequence.actionIds.length);
        for (uint256 i = 0; i < sequence.actionIds.length; i++) {
            actionIdWords[i] = bytes32(sequence.actionIds[i]);
        }

        return keccak256(abi.encode(
            SEQUENCE_TYPEHASH,
            keccak256(bytes(sequence.name)),
            keccak256(abi.encodePacked(actionHashes)),
            keccak256(abi.encodePacked(actionIdWords)),
            keccak256(abi.encodePacked(callDataHashes))
        ));
    }

    function hashChainSequence(IEip712TypedDataSafeModule.ChainSequence memory chainSequence) public pure returns (bytes32) {
        return keccak256(abi.encode(
            CHAIN_SEQUENCE_TYPEHASH,
            chainSequence.chainId,
            chainSequence.sequenceNonce,
            chainSequence.deploySafe,
            chainSequence.enableGasRefund,
            chainSequence.maxRefundAmount,
            chainSequence.refundRecipient,
            hashSequence(chainSequence.sequence)
        ));
    }

    function hashBundle(IEip712TypedDataSafeModule.Bundle memory bundle) public pure returns (bytes32) {
        bytes32[] memory chainSequenceHashes = new bytes32[](bundle.sequences.length);
        for (uint256 i = 0; i < bundle.sequences.length; i++) {
            chainSequenceHashes[i] = hashChainSequence(bundle.sequences[i]);
        }

        return keccak256(abi.encode(
            BUNDLE_TYPEHASH,
            bundle.expiry,
            keccak256(abi.encodePacked(chainSequenceHashes))
        ));
    }

    function domainSeparator(string memory name, string memory version, address verifyingContract) public pure returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            1, // hardcoded chainID 1
            verifyingContract,
            keccak256("BravaSafe")
        ));
    }

    function hashBundleForSigning(
        string memory name,
        string memory version,
        address verifyingContract,
        IEip712TypedDataSafeModule.Bundle calldata bundle
    ) public pure returns (bytes32) {
        bytes32 ds = domainSeparator(name, version, verifyingContract);
        return keccak256(abi.encodePacked("\x19\x01", ds, hashBundle(bundle)));
    }
}


