// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Errors} from "../Errors.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {IOwnerManager} from "../interfaces/safe/IOwnerManager.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";
import {ITokenRegistry} from "../interfaces/ITokenRegistry.sol";
import {IAggregatorV3} from "../interfaces/chainlink/IAggregatorV3.sol";
import {Enum} from "../libraries/Enum.sol";
import {ActionBase} from "../actions/ActionBase.sol";
import {GasRefundLib} from "../libraries/GasRefundLib.sol";
import {ISequenceExecutor} from "../interfaces/ISequenceExecutor.sol";

/// @title EIP712TypedDataSafeModule
/// @notice Safe module that handles EIP-712 typed data signing for cross-chain bundle execution
/// @notice Verifies signatures against Safe owners and forwards validated sequences to the sequence executor
/// @notice Includes optional gas refund functionality with economic protections
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract EIP712TypedDataSafeModule {
    using ECDSA for bytes32;

    // EIP-712 Type definitions following proven patterns
    string private constant ACTION_DEFINITION_TYPE = "ActionDefinition(string protocolName,uint8 actionType)";
    string private constant SEQUENCE_TYPE = "Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)ActionDefinition(string protocolName,uint8 actionType)";
    string private constant CHAIN_SEQUENCE_TYPE = "ChainSequence(uint256 chainId,uint256 sequenceNonce,bool deploySafe,bool enableGasRefund,address refundToken,uint256 maxRefundAmount,uint8 refundRecipient,Sequence sequence)ActionDefinition(string protocolName,uint8 actionType)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)";
    string private constant BUNDLE_TYPE = "Bundle(uint256 expiry,ChainSequence[] sequences)ActionDefinition(string protocolName,uint8 actionType)ChainSequence(uint256 chainId,uint256 sequenceNonce,bool deploySafe,bool enableGasRefund,address refundToken,uint256 maxRefundAmount,uint8 refundRecipient,Sequence sequence)Sequence(string name,ActionDefinition[] actions,bytes4[] actionIds,bytes[] callData)";
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
        bool deploySafe;
        bool enableGasRefund;
        address refundToken;
        uint256 maxRefundAmount;
        uint8 refundRecipient; // 0=executor, 1=fee recipient
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
    ISafeDeployment public immutable SAFE_DEPLOYMENT;
    ITokenRegistry public immutable TOKEN_REGISTRY;
    IAggregatorV3 public immutable ETH_USD_ORACLE;
    address public immutable FEE_RECIPIENT;
    // Selector sourced from interface to avoid drift when function signature changes
    bytes4 public constant EXECUTE_SEQUENCE_SELECTOR = ISequenceExecutor.executeSequence.selector;

    // EIP-712 domain fields
    string public domainName;
    string public domainVersion;

    // Tracking processed sequence nonces per Safe
    mapping(address => uint256) public sequenceNonces;

    // Transient-like context for gas refund action to consume after sequence execution
    // Stored per Safe and consumed by the Safe via external call from the refund action
    mapping(address => uint256) private gasStartBySafe;
    mapping(address => address) private executorBySafe;

    // Events
    event BundleExecuted(address indexed safe, uint256 indexed expiry, uint256 indexed chainId, uint256 sequenceNonce);
    event SignatureVerified(address indexed safe, address indexed signer, bytes32 indexed bundleHash);
    event SafeDeployedForExecution(address indexed signer, address indexed safeAddress);
    event GasRefundProcessed(address indexed safe, address indexed refundToken, uint256 refundAmount, address indexed recipient);

    constructor(
        address _adminVault,
        address _sequenceExecutor,
        address _safeDeployment,
        address _tokenRegistry,
        address _ethUsdOracle,
        address _feeRecipient,
        string memory _domainName,
        string memory _domainVersion
    ) {
        ADMIN_VAULT = IAdminVault(_adminVault);
        SEQUENCE_EXECUTOR_ADDR = _sequenceExecutor;
        SAFE_DEPLOYMENT = ISafeDeployment(_safeDeployment);
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
        ETH_USD_ORACLE = IAggregatorV3(_ethUsdOracle);
        FEE_RECIPIENT = _feeRecipient;
        
        // Store domain fields
        domainName = _domainName;
        domainVersion = _domainVersion;
    }

    /// @notice Executes a validated bundle for the current chain and nonce
    /// @dev This is the main entry point with explicit Safe address and controlled deployment
    /// @param _safeAddr The Safe address to execute on (used for domain verification)
    /// @param _bundle The bundle containing sequences for multiple chains
    /// @param _signature EIP-712 signature from a Safe owner
    function executeBundle(
        address _safeAddr,
        Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable {
        // Record gas at the beginning and the executor for the refund action to consume later
        uint256 gasStart = gasleft();
        gasStartBySafe[_safeAddr] = gasStart;
        executorBySafe[_safeAddr] = msg.sender;

        // Verify bundle hasn't expired
        if (_bundle.expiry <= block.timestamp) {
            revert Errors.EIP712TypedDataSafeModule_BundleExpired();
        }

        // Verify EIP-712 signature using Safe address as verifying contract
        bytes32 digest = hashBundleForSigning(_safeAddr, _bundle);
        address signer = digest.recover(_signature);
        
        if (signer == address(0)) {
            revert Errors.EIP712TypedDataSafeModule_InvalidSignature();
        }
        
        emit SignatureVerified(_safeAddr, signer, digest);

        // Find the sequence for current chain and next nonce
        uint256 currentChainId = block.chainid;
        uint256 expectedSequenceNonce = sequenceNonces[_safeAddr];
        
        ChainSequence memory targetSequence = _findChainSequence(
            _bundle.sequences,
            currentChainId,
            expectedSequenceNonce
        );
        
        // Handle Safe deployment if requested
        if (targetSequence.deploySafe) {
            // Validate that the provided Safe address matches predicted deployment address
            address predictedSafeAddr = SAFE_DEPLOYMENT.predictSafeAddress(signer);
            if (_safeAddr != predictedSafeAddr) {
                revert Errors.EIP712TypedDataSafeModule_SafeAddressMismatch(_safeAddr, predictedSafeAddr);
            }
            
            // Deploy Safe if it doesn't exist
            if (!SAFE_DEPLOYMENT.isSafeDeployed(signer)) {
                try SAFE_DEPLOYMENT.deploySafe(signer) returns (address deployedSafeAddr) {
                    emit SafeDeployedForExecution(signer, deployedSafeAddr);
                } catch {
                    revert Errors.EIP712TypedDataSafeModule_SafeDeploymentFailed();
                }
            }
        }
        
        // Verify signer is a Safe owner (after potential deployment)
        if (!IOwnerManager(_safeAddr).isOwner(signer)) {
            revert Errors.EIP712TypedDataSafeModule_SignerNotOwner(signer);
        }

        // Validate the sequence actions match their call data
        bytes4[] memory actionIds = _validateSequenceActions(targetSequence.sequence);

        // Update sequence nonce
        sequenceNonces[_safeAddr] = expectedSequenceNonce + 1;

        // Execute the sequence via Safe module transaction
        // Convert to the format expected by SequenceExecutor
        ExecutorSequence memory executorSequence = ExecutorSequence({
            name: targetSequence.sequence.name,
            callData: targetSequence.sequence.callData,
            actionIds: actionIds
        });

        bytes memory sequenceData = abi.encodeWithSelector(
            EXECUTE_SEQUENCE_SELECTOR,
            executorSequence,
            _bundle,
            _signature,
            uint16(0) // strategyId = 0 for EIP712 executions
        );

        bool success = ISafe(_safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            0, // DelegateCall ignores value; pass 0 for clarity
            sequenceData,
            Enum.Operation.DelegateCall
        );

        if (!success) {
            revert Errors.EIP712TypedDataSafeModule_ExecutionFailed();
        }

        // Gas refund is handled by a dedicated action that consumes context from this module

        emit BundleExecuted(_safeAddr, _bundle.expiry, currentChainId, expectedSequenceNonce);
    }

    /// @notice Returns and clears the gas refund context for the calling Safe
    /// @dev Must be called by the Safe that executed the sequence (msg.sender is the Safe)
    /// @return startGas The gas recorded at the beginning of module execution
    /// @return executor The externally-owned account that initiated execution on the module
    function consumeGasContext() external returns (uint256 startGas, address executor) {
        address safe = msg.sender;
        startGas = gasStartBySafe[safe];
        executor = executorBySafe[safe];
        delete gasStartBySafe[safe];
        delete executorBySafe[safe];
    }

    /// @notice Gets the next expected sequence nonce for a Safe
    /// @param _safeAddr Address of the Safe
    /// @return The next expected sequence nonce
    function getSequenceNonce(address _safeAddr) external view returns (uint256) {
        return sequenceNonces[_safeAddr];
    }

    /// @notice Gets the EIP-712 domain separator for a specific Safe address
    /// @param _safeAddr The Safe address to use as verifying contract
    /// @return The domain separator
    /// @dev Uses hardcoded chainID 1 for cross-chain compatibility
    function getDomainSeparator(address _safeAddr) external view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes(domainName)),
            keccak256(bytes(domainVersion)),
            1, // Hardcoded chainID 1 for cross-chain compatibility
            _safeAddr,
            keccak256("BravaSafe")
        ));
    }

    /// @notice Computes the EIP-712 hash for a bundle (view function for external verification)
    /// @param _safeAddr The Safe address to use as verifying contract
    /// @param _bundle The bundle to hash
    /// @return The EIP-712 hash that should be signed
    function getBundleHash(address _safeAddr, Bundle calldata _bundle) external view returns (bytes32) {
        return hashBundleForSigning(_safeAddr, _bundle);
    }

    /// @notice Computes the raw bundle hash (for testing purposes)
    /// @param _bundle The bundle to hash
    /// @return The raw bundle hash (before EIP-712 domain separator)
    function getRawBundleHash(Bundle calldata _bundle) external pure returns (bytes32) {
        return hashBundle(_bundle);
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
        revert Errors.EIP712TypedDataSafeModule_ChainSequenceNotFound(_chainId, _expectedNonce);
    }

    /// @notice Validates that sequence actions match their expected types and protocols
    /// @param _sequence The sequence to validate
    /// @return actionIds Array of action IDs from the sequence
    function _validateSequenceActions(Sequence memory _sequence) internal view returns (bytes4[] memory actionIds) {
        if (_sequence.actions.length != _sequence.callData.length || 
            _sequence.actions.length != _sequence.actionIds.length) {
            revert Errors.EIP712TypedDataSafeModule_LengthMismatch();
        }
        
        actionIds = _sequence.actionIds;
        
        for (uint256 i = 0; i < _sequence.actions.length; i++) {
            bytes4 actionId = _sequence.actionIds[i];
            
            // Get the action contract address
            address actionAddr = ADMIN_VAULT.getActionAddress(actionId);
            if (actionAddr == address(0)) {
                revert Errors.EIP712TypedDataSafeModule_ActionNotFound(actionId);
            }
            
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
                revert Errors.EIP712TypedDataSafeModule_ActionMismatch(
                    i,
                    expectedAction.protocolName,
                    expectedAction.actionType,
                    actualProtocolName,
                    actualActionType
                );
            }
        }
    }

    /// @notice Processes gas refund for the executed transaction
    /// @param _targetSequence The chain sequence with refund parameters
    /// @param _gasStart Gas remaining at start of transaction
    /// @param _executor The address that executed the transaction
    function _processGasRefund(
        address _safeAddr,
        ChainSequence memory _targetSequence,
        uint256 _gasStart,
        address _executor
    ) internal {
        try this._executeGasRefund(_safeAddr, _targetSequence, _gasStart, _executor) {
            // Gas refund succeeded
        } catch {
            // Gas refund failed - continue execution without reverting
            // This ensures that sequence execution is not blocked by refund issues
        }
    }

    /// @notice External function to handle gas refund (allows try/catch)
    /// @param _targetSequence The chain sequence with refund parameters
    /// @param _gasStart Gas remaining at start of transaction
    /// @param _executor The address that executed the transaction
    function _executeGasRefund(
        address _safeAddr,
        ChainSequence calldata _targetSequence,
        uint256 _gasStart,
        address _executor
    ) external {
        // Only allow self-calls
        if (msg.sender != address(this)) {
            revert Errors.EIP712TypedDataSafeModule_UnauthorizedRefundCall();
        }

        // Validate refund token
        if (_targetSequence.refundToken == address(0)) {
            revert Errors.EIP712TypedDataSafeModule_InvalidRefundToken(_targetSequence.refundToken);
        }

        // Process gas refund using the library
        GasRefundLib.RefundParams memory refundParams = GasRefundLib.RefundParams({
            startGas: _gasStart,
            endGas: gasleft(),
            refundToken: _targetSequence.refundToken,
            maxRefundAmount: _targetSequence.maxRefundAmount,
            refundTo: GasRefundLib.RefundRecipient(_targetSequence.refundRecipient),
            executor: _executor,
            feeRecipient: FEE_RECIPIENT,
            tokenRegistry: TOKEN_REGISTRY,
            ethUsdOracle: ETH_USD_ORACLE
        });

        uint256 refundAmount = GasRefundLib.processGasRefund(refundParams);

        // Resolve actual recipient for event
        address actualRecipient = _targetSequence.refundRecipient == 0 ? _executor : FEE_RECIPIENT;

        // Emit with the Safe address for accurate attribution
        emit GasRefundProcessed(_safeAddr, _targetSequence.refundToken, refundAmount, actualRecipient);
    }

    // =============================================================
    //                    EIP-712 HASHING HELPERS
    // =============================================================

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
            chainSequence.deploySafe,
            chainSequence.enableGasRefund,
            chainSequence.refundToken,
            chainSequence.maxRefundAmount,
            chainSequence.refundRecipient,
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

    /// @notice Create the final EIP-712 v4 hash for signing
    /// @param _safeAddr The Safe address to use as verifying contract in domain
    /// @param bundle The bundle to hash
    /// @dev Uses hardcoded chainID 1 for cross-chain compatibility
    function hashBundleForSigning(address _safeAddr, Bundle memory bundle) public view returns (bytes32) {
        bytes32 domainSeparator = keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes(domainName)),
            keccak256(bytes(domainVersion)),
            1, // Hardcoded chainID 1 for cross-chain compatibility
            _safeAddr, // Safe address as verifying contract
            keccak256("BravaSafe") // Fixed salt for domain separation
        ));
        
        return keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator,
            hashBundle(bundle)
        ));
    }
} 