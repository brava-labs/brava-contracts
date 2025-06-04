// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Errors} from "../Errors.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {IOwnerManager} from "../interfaces/safe/IOwnerManager.sol";
import {Enum} from "../libraries/Enum.sol";
import {ActionBase} from "../actions/ActionBase.sol";
import "hardhat/console.sol";

/// @title EIP712TypedDataSafeModule
/// @notice Safe module that handles EIP-712 typed data signing for cross-chain bundle execution
/// @notice Verifies signatures against Safe owners and forwards validated sequences to the sequence executor
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract EIP712TypedDataSafeModule {
    using ECDSA for bytes32;

    // EIP-712 Type definitions following proven patterns
    string private constant ACTION_DEFINITION_TYPE = "ActionDefinition(string protocolName,uint8 actionType)";
    string private constant SEQUENCE_TYPE = "Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)";
    string private constant CHAIN_SEQUENCE_TYPE = "ChainSequence(uint256 chainId,uint256 sequenceNonce,Sequence sequence)ActionDefinition(string protocolName,uint8 actionType)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)";
    string private constant BUNDLE_TYPE = "Bundle(uint256 expiry,ChainSequence[] sequences)ActionDefinition(string protocolName,uint8 actionType)ChainSequence(uint256 chainId,uint256 sequenceNonce,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)";
    string private constant DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)";

    // Computed type hashes
    bytes32 private constant ACTION_DEFINITION_TYPEHASH = keccak256(abi.encodePacked(ACTION_DEFINITION_TYPE));
    bytes32 private constant SEQUENCE_TYPEHASH = keccak256(abi.encodePacked(SEQUENCE_TYPE));
    bytes32 private constant CHAIN_SEQUENCE_TYPEHASH = keccak256(abi.encodePacked(CHAIN_SEQUENCE_TYPE));
    bytes32 private constant BUNDLE_TYPEHASH = keccak256(abi.encodePacked(BUNDLE_TYPE));
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(abi.encodePacked(DOMAIN_TYPE));

    struct ActionDefinition {
        string protocolName;
        uint8 actionType;
    }

    struct Sequence {
        string name;
        ActionDefinition[] actions;
        bytes4[] actionIds;
        bytes[] callData;
    }

    struct ChainSequence {
        uint256 chainId;
        uint256 sequenceNonce;
        Sequence sequence;
    }

    struct Bundle {
        uint256 expiry;
        ChainSequence[] sequences;
    }

    // Struct to match SequenceExecutor.Sequence format
    struct ExecutorSequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    IAdminVault public immutable ADMIN_VAULT;
    address public immutable SEQUENCE_EXECUTOR_ADDR;
    bytes4 public constant EXECUTE_SEQUENCE_SELECTOR = bytes4(keccak256("executeSequence((string,bytes[],bytes4[]))"));

    // EIP-712 domain fields
    string public domainName;
    string public domainVersion;
    bytes32 public immutable DOMAIN_SEPARATOR;

    // Tracking processed sequence nonces per Safe per chain
    mapping(address => mapping(uint256 => uint256)) public sequenceNonces;

    // Events
    event BundleExecuted(address indexed safe, uint256 indexed expiry, uint256 indexed chainId, uint256 sequenceNonce);
    event SignatureVerified(address indexed safe, address indexed signer, bytes32 indexed bundleHash);

    // Custom errors
    error EIP712TypedDataSafeModule_InvalidSignature();
    error EIP712TypedDataSafeModule_BundleExpired();
    error EIP712TypedDataSafeModule_ChainSequenceNotFound(uint256 chainId, uint256 expectedNonce);
    error EIP712TypedDataSafeModule_ActionMismatch(uint256 actionIndex, string expectedProtocol, uint8 expectedType, string actualProtocol, uint8 actualType);
    error EIP712TypedDataSafeModule_ExecutionFailed();
    error EIP712TypedDataSafeModule_SignerNotOwner(address signer);
    error EIP712TypedDataSafeModule_LengthMismatch();

    constructor(
        address _adminVault,
        address _sequenceExecutor,
        string memory _domainName,
        string memory _domainVersion
    ) {
        ADMIN_VAULT = IAdminVault(_adminVault);
        SEQUENCE_EXECUTOR_ADDR = _sequenceExecutor;
        
        // Store domain fields
        domainName = _domainName;
        domainVersion = _domainVersion;
        
        // Create domain separator with FORCED chainId 1 for cross-chain compatibility
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes(_domainName)),
            keccak256(bytes(_domainVersion)),
            1, // ALWAYS use chainId 1 for user convenience
            address(this),
            keccak256("BravaSafeModule") // salt for additional uniqueness
        ));
    }

    /// @notice Hash an ActionDefinition following proven EIP-712 patterns
    function hashActionDefinition(ActionDefinition memory action) private pure returns (bytes32) {
        return keccak256(abi.encode(
            ACTION_DEFINITION_TYPEHASH,
            keccak256(bytes(action.protocolName)),
            action.actionType
        ));
    }

    /// @notice Hash a Sequence following proven EIP-712 patterns
    function hashSequence(Sequence memory sequence) private pure returns (bytes32) {
        // Hash all actions
        bytes32[] memory actionHashes = new bytes32[](sequence.actions.length);
        for (uint256 i = 0; i < sequence.actions.length; i++) {
            actionHashes[i] = hashActionDefinition(sequence.actions[i]);
        }

        // Hash all callData elements individually
        bytes32[] memory callDataHashes = new bytes32[](sequence.callData.length);
        for (uint256 i = 0; i < sequence.callData.length; i++) {
            callDataHashes[i] = keccak256(sequence.callData[i]);
        }

        return keccak256(abi.encode(
            SEQUENCE_TYPEHASH,
            keccak256(bytes(sequence.name)),
            keccak256(abi.encodePacked(actionHashes)),
            keccak256(abi.encodePacked(sequence.actionIds)),
            keccak256(abi.encodePacked(callDataHashes))
        ));
    }

    /// @notice Hash a ChainSequence following proven EIP-712 patterns
    function hashChainSequence(ChainSequence memory chainSequence) private pure returns (bytes32) {
        return keccak256(abi.encode(
            CHAIN_SEQUENCE_TYPEHASH,
            chainSequence.chainId,
            chainSequence.sequenceNonce,
            hashSequence(chainSequence.sequence)
        ));
    }

    /// @notice Hash a Bundle following proven EIP-712 patterns
    function hashBundle(Bundle memory bundle) private pure returns (bytes32) {
        // Hash all chain sequences
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

    /// @notice Create the final EIP-712 hash for signing (following gist pattern)
    function hashBundleForSigning(Bundle memory bundle) public view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            hashBundle(bundle)
        ));
    }

    /// @notice Executes a validated bundle for the current chain and nonce
    /// @param _safeAddr Address of the Safe
    /// @param _bundle The bundle containing sequences for multiple chains
    /// @param _signature EIP-712 signature from a Safe owner
    function executeBundle(
        address _safeAddr,
        Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable {
        console.log("EIP712TypedDataSafeModule: executeBundle called for Safe:", _safeAddr);
        
        // Verify bundle hasn't expired
        if (_bundle.expiry <= block.timestamp) {
            revert EIP712TypedDataSafeModule_BundleExpired();
        }
        console.log("EIP712TypedDataSafeModule: Bundle expiry check passed");

        // Verify EIP-712 signature using proven pattern
        bytes32 digest = hashBundleForSigning(_bundle);
        address signer = digest.recover(_signature);
        
        if (signer == address(0)) {
            revert EIP712TypedDataSafeModule_InvalidSignature();
        }
        
        console.log("EIP712TypedDataSafeModule: Signature verified for signer:", signer);
        
        // Verify signer is a Safe owner
        if (!IOwnerManager(_safeAddr).isOwner(signer)) {
            revert EIP712TypedDataSafeModule_SignerNotOwner(signer);
        }
        console.log("EIP712TypedDataSafeModule: Signer is confirmed Safe owner");

        emit SignatureVerified(_safeAddr, signer, digest);

        // Find the sequence for current chain and next nonce
        uint256 currentChainId = block.chainid;
        uint256 expectedSequenceNonce = sequenceNonces[_safeAddr][currentChainId];
        console.log("EIP712TypedDataSafeModule: Looking for chain sequence for chainId:", currentChainId);
        console.log("EIP712TypedDataSafeModule: Expected sequence nonce:", expectedSequenceNonce);
        
        ChainSequence memory targetSequence = _findChainSequence(
            _bundle.sequences,
            currentChainId,
            expectedSequenceNonce
        );
        console.log("EIP712TypedDataSafeModule: Found target sequence");

        // Validate the sequence actions match their call data
        bytes4[] memory actionIds = _validateSequenceActions(targetSequence.sequence);
        console.log("EIP712TypedDataSafeModule: Actions validated, found", actionIds.length, "actions");

        // Update sequence nonce for this chain
        sequenceNonces[_safeAddr][currentChainId] = expectedSequenceNonce + 1;

        // Execute the sequence via Safe module transaction
        // Convert to the format expected by SequenceExecutor
        ExecutorSequence memory executorSequence = ExecutorSequence({
            name: targetSequence.sequence.name,
            callData: targetSequence.sequence.callData,
            actionIds: actionIds
        });

        bytes memory sequenceData = abi.encodeWithSelector(
            EXECUTE_SEQUENCE_SELECTOR,
            executorSequence
        );
        console.log("EIP712TypedDataSafeModule: About to call execTransactionFromModule");
        console.log("EIP712TypedDataSafeModule: Target:", SEQUENCE_EXECUTOR_ADDR);
        console.log("EIP712TypedDataSafeModule: Value:", msg.value);

        bool success = ISafe(_safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            msg.value,
            sequenceData,
            Enum.Operation.DelegateCall
        );

        console.log("EIP712TypedDataSafeModule: execTransactionFromModule returned:", success);
        if (!success) {
            revert EIP712TypedDataSafeModule_ExecutionFailed();
        }

        emit BundleExecuted(_safeAddr, _bundle.expiry, currentChainId, expectedSequenceNonce);
        console.log("EIP712TypedDataSafeModule: Bundle executed successfully");
    }

    /// @notice Gets the next expected sequence nonce for a Safe on a specific chain
    /// @param _safeAddr Address of the Safe
    /// @param _chainId Chain ID
    /// @return The next expected sequence nonce
    function getSequenceNonce(address _safeAddr, uint256 _chainId) external view returns (uint256) {
        return sequenceNonces[_safeAddr][_chainId];
    }

    /// @notice Finds the chain sequence for the current chain and expected nonce
    /// @param _sequences Array of chain sequences
    /// @param _chainId Target chain ID
    /// @param _expectedNonce Expected sequence nonce
    /// @return The matching chain sequence
    function _findChainSequence(
        ChainSequence[] memory _sequences,
        uint256 _chainId,
        uint256 _expectedNonce
    ) internal pure returns (ChainSequence memory) {
        for (uint256 i = 0; i < _sequences.length; i++) {
            if (_sequences[i].chainId == _chainId && _sequences[i].sequenceNonce == _expectedNonce) {
                return _sequences[i];
            }
        }
        revert EIP712TypedDataSafeModule_ChainSequenceNotFound(_chainId, _expectedNonce);
    }

    /// @notice Validates that sequence actions match their expected types and protocols
    /// @param _sequence The sequence to validate
    /// @return actionIds Array of action IDs from the sequence
    function _validateSequenceActions(Sequence memory _sequence) internal view returns (bytes4[] memory actionIds) {
        if (_sequence.actions.length != _sequence.callData.length || 
            _sequence.actions.length != _sequence.actionIds.length) {
            revert EIP712TypedDataSafeModule_LengthMismatch();
        }
        
        actionIds = _sequence.actionIds;
        
        for (uint256 i = 0; i < _sequence.actions.length; i++) {
            bytes4 actionId = _sequence.actionIds[i];
            
            // Get the action contract address
            address actionAddr = ADMIN_VAULT.getActionAddress(actionId);
            require(actionAddr != address(0), "Action not found");
            
            // Verify protocol name and action type match
            ActionBase action = ActionBase(actionAddr);
            string memory actualProtocolName = action.protocolName();
            uint8 actualActionType = action.actionType();
            
            // Compare with expected values from typed data
            ActionDefinition memory expectedAction = _sequence.actions[i];
            
            if (
                keccak256(bytes(actualProtocolName)) != keccak256(bytes(expectedAction.protocolName)) ||
                actualActionType != expectedAction.actionType
            ) {
                revert EIP712TypedDataSafeModule_ActionMismatch(
                    i,
                    expectedAction.protocolName,
                    expectedAction.actionType,
                    actualProtocolName,
                    actualActionType
                );
            }
        }
    }

    /// @notice Gets the EIP-712 domain separator for this contract (always uses chainId 1)
    /// @return The domain separator
    function getDomainSeparator() external view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }

    /// @notice Computes the EIP-712 hash for a bundle (view function for external verification)
    /// @param _bundle The bundle to hash
    /// @return The EIP-712 hash that should be signed
    function getBundleHash(Bundle calldata _bundle) external view returns (bytes32) {
        return hashBundleForSigning(_bundle);
    }

    /// @notice Computes the raw bundle hash (for testing purposes)
    /// @param _bundle The bundle to hash
    /// @return The raw bundle hash (before EIP-712 domain separator)
    function getRawBundleHash(Bundle calldata _bundle) external pure returns (bytes32) {
        return hashBundle(_bundle);
    }
} 