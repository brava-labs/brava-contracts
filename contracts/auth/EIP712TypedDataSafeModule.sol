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
import {ISequenceExecutor} from "../interfaces/ISequenceExecutor.sol";

/// @title EIP712TypedDataSafeModule
/// @notice Safe module that handles EIP-712 typed data signing for cross-chain bundle execution
/// @notice Verifies signatures against Safe owners and forwards validated sequences to the sequence executor
/// @notice Includes optional gas refund functionality with economic protections
/// @dev Designed for 1-of-1 Safes: this module verifies the signer is an owner but does not enforce Safe threshold
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

    struct ExecutorSequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    IAdminVault public ADMIN_VAULT;
    address public SEQUENCE_EXECUTOR_ADDR;
    ISafeDeployment public SAFE_DEPLOYMENT;
    ITokenRegistry public TOKEN_REGISTRY;
    IAggregatorV3 public ETH_USD_ORACLE;
    address public FEE_RECIPIENT;

    address public immutable CONFIG_SETTER;

    bytes4 public constant EXECUTE_SEQUENCE_SELECTOR = ISequenceExecutor.executeSequence.selector;

    string public domainName;
    string public domainVersion;

    bool public isInitialized;

    mapping(address => uint256) public sequenceNonces;

    mapping(address => uint256) private gasStartBySafe;
    mapping(address => address) private executorBySafe;

    event BundleExecuted(address indexed safe, uint256 indexed expiry, uint256 indexed chainId, uint256 sequenceNonce);
    event SignatureVerified(address indexed safe, address indexed signer, bytes32 indexed bundleHash);
    event SafeDeployedForExecution(address indexed signer, address indexed safeAddress);
    event ConfigInitialized(
        address adminVault,
        address sequenceExecutor,
        address safeDeployment,
        address tokenRegistry,
        address oracle,
        address feeRecipient,
        string name,
        string version
    );

    constructor(address _configSetter) {
        require(_configSetter != address(0), "Invalid input");
        CONFIG_SETTER = _configSetter;
    }

    /// @notice One-time initializer to set all external references and domain fields
    /// @dev Callable only once by CONFIG_SETTER to keep deployment deterministic across chains
    function initializeConfig(
        address _adminVault,
        address _sequenceExecutor,
        address _safeDeployment,
        address _tokenRegistry,
        address _ethUsdOracle,
        address _feeRecipient,
        string memory _domainName,
        string memory _domainVersion
    ) external {
        require(msg.sender == CONFIG_SETTER, "Unauthorized");
        require(!isInitialized, "Already initialized");
        require(
            _adminVault != address(0) &&
            _sequenceExecutor != address(0) &&
            _safeDeployment != address(0) &&
            _tokenRegistry != address(0) &&
            _ethUsdOracle != address(0) &&
            _feeRecipient != address(0),
            "Invalid input"
        );

        ADMIN_VAULT = IAdminVault(_adminVault);
        SEQUENCE_EXECUTOR_ADDR = _sequenceExecutor;
        SAFE_DEPLOYMENT = ISafeDeployment(_safeDeployment);
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
        ETH_USD_ORACLE = IAggregatorV3(_ethUsdOracle);
        FEE_RECIPIENT = _feeRecipient;
        domainName = _domainName;
        domainVersion = _domainVersion;
        isInitialized = true;

        emit ConfigInitialized(
            _adminVault,
            _sequenceExecutor,
            _safeDeployment,
            _tokenRegistry,
            _ethUsdOracle,
            _feeRecipient,
            _domainName,
            _domainVersion
        );
    }

    /// @notice Executes a validated bundle for the current chain and nonce
    /// @dev This is the main entry point with explicit Safe address and controlled deployment
    /// @dev Expects single-owner Safes; verifies signer ownership but does not enforce Safe threshold
    /// @param _safeAddr The Safe address to execute on (used for domain verification)
    /// @param _bundle The bundle containing sequences for multiple chains
    /// @param _signature EIP-712 signature from a Safe owner
    function executeBundle(
        address _safeAddr,
        Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable {
        // Record gas at the beginning and the executor for the refund action to consume later
        gasStartBySafe[_safeAddr] = gasleft();
        executorBySafe[_safeAddr] = tx.origin;

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
        uint256 expectedSequenceNonce = sequenceNonces[_safeAddr];
        
        ChainSequence memory targetSequence = _findChainSequence(
            _bundle.sequences,
            block.chainid,
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

        // Validate actions and detect if a gas refund action is present (reverse scan for gas efficiency)
        (bytes4[] memory actionIds, bool hasRefundAction) = _validateSequenceActionsAndDetectRefund(
            targetSequence.sequence,
            targetSequence.refundRecipient
        );

        // Enforce enableGasRefund flag consistency with presence of GasRefundAction
        if (targetSequence.enableGasRefund && !hasRefundAction) {
            revert Errors.EIP712TypedDataSafeModule_RefundActionRequired();
        }
        if (!targetSequence.enableGasRefund && hasRefundAction) {
            revert Errors.EIP712TypedDataSafeModule_RefundActionNotAllowed();
        }

        // Update sequence nonce
        sequenceNonces[_safeAddr] = expectedSequenceNonce + 1;

        // Execute the sequence via Safe module transaction
        if (!ISafe(_safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            0, // DelegateCall ignores value; pass 0 for clarity
            abi.encodeWithSelector(
                EXECUTE_SEQUENCE_SELECTOR,
                ExecutorSequence({
                    name: targetSequence.sequence.name,
                    callData: targetSequence.sequence.callData,
                    actionIds: actionIds
                }),
                _bundle,
                _signature,
                uint16(0) // strategyId = 0 for EIP712 executions
            ),
            Enum.Operation.DelegateCall
        )) {
            revert Errors.EIP712TypedDataSafeModule_ExecutionFailed();
        }

        // Gas refund is handled by a dedicated action that consumes context from this module

        emit BundleExecuted(_safeAddr, _bundle.expiry, block.chainid, expectedSequenceNonce);
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
    /// @dev Uses hardcoded chainID 1 for cross-chain compatibility as part of cross-chain domain design
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

    /// @notice Validates action metadata, registration, and detects presence of GasRefundAction
    /// @param _sequence The sequence to validate
    /// @return actionIds Array of action IDs from the sequence
    /// @return hasRefundAction True if a GasRefundAction is present in the sequence
    function _validateSequenceActionsAndDetectRefund(Sequence memory _sequence, uint8 _refundRecipient)
        internal
        view
        returns (bytes4[] memory actionIds, bool hasRefundAction)
    {
        if (_sequence.actions.length != _sequence.callData.length || 
            _sequence.actions.length != _sequence.actionIds.length) {
            revert Errors.EIP712TypedDataSafeModule_LengthMismatch();
        }
        
        actionIds = _sequence.actionIds;
        hasRefundAction = false;

        // Scan from last to first expecting refund action near the end
        for (uint256 i = _sequence.actions.length; i > 0; i--) {
            uint256 idx = i - 1;
            bytes4 actionId = _sequence.actionIds[idx];
            
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
            ActionDefinition memory expectedAction = _sequence.actions[idx];
            
            if (
                keccak256(bytes(actualProtocolName)) != keccak256(bytes(expectedAction.protocolName)) ||
                actualActionType != expectedAction.actionType
            ) {
                revert Errors.EIP712TypedDataSafeModule_ActionMismatch(
                    idx,
                    expectedAction.protocolName,
                    expectedAction.actionType,
                    actualProtocolName,
                    actualActionType
                );
            }

            // Detect GasRefundAction via ActionType.FEE_ACTION
            if (!hasRefundAction && actualActionType == uint8(ActionBase.ActionType.FEE_ACTION)) {
                // Ask the action if the provided typed-data value is valid (capability probe)
                (bool ok, bytes memory ret) = actionAddr.staticcall(
                    abi.encodeWithSignature("isValidRefundRecipient(uint8)", _refundRecipient)
                );
                if (ok && ret.length >= 32) {
                    bool valid = abi.decode(ret, (bool));
                    if (!valid) {
                        revert Errors.EIP712TypedDataSafeModule_InvalidRefundRecipient(_refundRecipient);
                    }
                }
                hasRefundAction = true;
            }
        }
    }

    // Gas refunds are handled by a dedicated action that consumes context via consumeGasContext()
    // that consumes context via consumeGasContext() for clear separation of responsibilities.

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

        // Canonical EIP-712 encoding for bytes4[] requires 32-byte element encoding per entry
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
    /// @dev Uses hardcoded chainID 1 for cross-chain compatibility as part of cross-chain domain design
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