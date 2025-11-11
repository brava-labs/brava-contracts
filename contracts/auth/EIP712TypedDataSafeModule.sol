// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712TypedDataLib} from "../libraries/EIP712TypedDataLib.sol";
import {Errors} from "../Errors.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {IOwnerManager} from "../interfaces/safe/IOwnerManager.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";
import {ITokenRegistry} from "../interfaces/ITokenRegistry.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IGasPriceAdaptor} from "../interfaces/IGasPriceAdaptor.sol";
import {Enum} from "../libraries/Enum.sol";
import {ActionBase} from "../actions/ActionBase.sol";
import {ISequenceExecutor} from "../interfaces/ISequenceExecutor.sol";
import {IEip712TypedDataSafeModule as ITyped} from "../interfaces/IEip712TypedDataSafeModule.sol";

/// @title EIP712TypedDataSafeModule
/// @notice Safe module that handles EIP-712 typed data signing for cross-chain bundle execution
/// @notice Verifies signatures against Safe owners and forwards validated sequences to the sequence executor
/// @notice Includes optional gas refund functionality with economic protections
/// @dev Designed for 1-of-1 Safes: this module verifies the signer is an owner but does not enforce Safe threshold
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract EIP712TypedDataSafeModule {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // EIP-712 helpers are provided by a library to reduce bytecode size

    // Struct types provided by interface ITyped

    struct ExecutorSequence {
        string name;
        bytes[] callData;
        bytes4[] actionIds;
    }

    IAdminVault public ADMIN_VAULT;
    address public SEQUENCE_EXECUTOR_ADDR;
    ISafeDeployment public SAFE_DEPLOYMENT;
    ITokenRegistry public TOKEN_REGISTRY;
    address public FEE_RECIPIENT;
    address public usdcToken; // set post-deploy to preserve deterministic bytecode

    address public immutable CONFIG_SETTER;

    bytes4 public constant EXECUTE_SEQUENCE_SELECTOR = ISequenceExecutor.executeSequence.selector;

    string public domainName;
    string public domainVersion;

    bool public isInitialized;

    mapping(address => uint256) public sequenceNonces;

    // Gas/refund context is computed inline in executeBundle; no persistent storage required

    event BundleExecuted(address indexed safe, uint256 indexed expiry, uint256 indexed chainId, uint256 sequenceNonce);
    event GasRefundProcessed(address indexed safe, address indexed refundToken, uint256 refundAmount, address indexed recipient);
    // =============================
    // Gas refund config
    // =============================
    uint256 public gasRefundOverhead;
    address public gasPriceAdaptor;

    event SignatureVerified(address indexed safe, address indexed signer, bytes32 indexed bundleHash);
    event SafeDeployedForExecution(address indexed signer, address indexed safeAddress);
    event ConfigInitialized(
        address adminVault,
        address sequenceExecutor,
        address safeDeployment,
        address tokenRegistry,
        address feeRecipient,
        string name,
        string version
    );

    constructor(address _configSetter) {
        require(_configSetter != address(0), "Invalid input");
        CONFIG_SETTER = _configSetter;
    }

    /// @notice One-time initializer to set all external references and domain fields
    /// @dev Callable only once by CONFIG_SETTER for deterministic deployment across chains
    /// @param _gasRefundOverhead Gas consumed after measurement point (transfers, events, return path)
    function initializeConfig(
        address _adminVault,
        address _sequenceExecutor,
        address _safeDeployment,
        address _tokenRegistry,
        address _feeRecipient,
        address _usdcToken,
        address _gasPriceAdaptor,
        uint256 _gasRefundOverhead,
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
            _feeRecipient != address(0) &&
            _usdcToken != address(0) &&
            _gasPriceAdaptor != address(0),
            "Invalid input"
        );

        ADMIN_VAULT = IAdminVault(_adminVault);
        SEQUENCE_EXECUTOR_ADDR = _sequenceExecutor;
        SAFE_DEPLOYMENT = ISafeDeployment(_safeDeployment);
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
        FEE_RECIPIENT = _feeRecipient;
        usdcToken = _usdcToken;
        gasPriceAdaptor = _gasPriceAdaptor;
        gasRefundOverhead = _gasRefundOverhead;
        domainName = _domainName;
        domainVersion = _domainVersion;
        isInitialized = true;

        emit ConfigInitialized(
            _adminVault,
            _sequenceExecutor,
            _safeDeployment,
            _tokenRegistry,
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
        ITyped.Bundle calldata _bundle,
        bytes calldata _signature
    ) external payable {
        // Record gas and executor at entry
        uint256 gasStart = gasleft();

        // Guard: config set during initializeConfig(); a single check is enough
        require(address(ADMIN_VAULT) != address(0), "Config not initialized");

        // Verify bundle hasn't expired
        if (_bundle.expiry <= block.timestamp) {
            revert Errors.EIP712TypedDataSafeModule_BundleExpired();
        }

        // Verify EIP-712 signature using Safe address as verifying contract
        bytes32 digest = EIP712TypedDataLib.hashBundleForSigning(domainName, domainVersion, _safeAddr, _bundle);
        address signer = digest.recover(_signature);
        
        if (signer == address(0)) {
            revert Errors.EIP712TypedDataSafeModule_InvalidSignature();
        }
        
        emit SignatureVerified(_safeAddr, signer, digest);

        // Find the sequence for current chain and next nonce
        uint256 expectedSequenceNonce = sequenceNonces[_safeAddr];
        
        ITyped.ChainSequence memory targetSequence = _findChainSequence(
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
        bool ok = _execThroughSafe(
            _safeAddr,
            ExecutorSequence({
                name: targetSequence.sequence.name,
                callData: targetSequence.sequence.callData,
                actionIds: actionIds
            }),
            _bundle,
            _signature
        );
        if (!ok) {
            revert Errors.EIP712TypedDataSafeModule_ExecutionFailed();
        }

        // Perform gas refund within module scope if enabled
        if (targetSequence.enableGasRefund) {
            _executeGasRefund(
                _safeAddr,
                targetSequence.maxRefundAmount,
                targetSequence.refundRecipient,
                gasStart
            );
        }

        emit BundleExecuted(_safeAddr, _bundle.expiry, block.chainid, expectedSequenceNonce);
    }

    function _execThroughSafe(
        address safeAddr,
        ExecutorSequence memory execSeq,
        ITyped.Bundle calldata bundle,
        bytes calldata signature
    ) private returns (bool) {
        return ISafe(safeAddr).execTransactionFromModule(
            SEQUENCE_EXECUTOR_ADDR,
            0,
            abi.encodeWithSelector(
                EXECUTE_SEQUENCE_SELECTOR,
                execSeq,
                bundle,
                signature,
                uint16(0)
            ),
            Enum.Operation.DelegateCall
        );
    }

    // Gas context is handled inline in executeBundle

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
        return EIP712TypedDataLib.domainSeparator(domainName, domainVersion, _safeAddr);
    }

    /// @notice Computes the EIP-712 hash for a bundle (view function for external verification)
    /// @param _safeAddr The Safe address to use as verifying contract
    /// @param _bundle The bundle to hash
    /// @return The EIP-712 hash that should be signed
    function getBundleHash(address _safeAddr, ITyped.Bundle calldata _bundle) external view returns (bytes32) {
        return EIP712TypedDataLib.hashBundleForSigning(domainName, domainVersion, _safeAddr, _bundle);
    }

    /// @notice Computes the raw bundle hash (for testing purposes)
    /// @param _bundle The bundle to hash
    /// @return The raw bundle hash (before EIP-712 domain separator)
    function getRawBundleHash(ITyped.Bundle calldata _bundle) external pure returns (bytes32) {
        return EIP712TypedDataLib.hashBundle(_bundle);
    }

    // =============================
    // Internal: Gas refund
    // =============================
    function _executeGasRefund(
        address safe,
        uint256 maxRefundAmount,
        uint8 refundRecipient,
        uint256 gasStart
    ) internal {
        IERC20 token = IERC20(usdcToken);
        uint256 moduleDeposit = token.balanceOf(address(this));
        
        // If no deposit, nothing to do
        if (moduleDeposit == 0) return;
        
        // Calculate refund amount - use zero values if any step fails
        uint256 refundAmount = 0;
        address recipient = address(0);
        
        // Try to get gas pricing rate
        (uint256 ratePerGas, uint256 fixedFee) = _safeGetRefundRate();
        
        if (ratePerGas > 0) {
            // Measure gas consumption including overhead
            uint256 gasUsed = gasStart > gasleft() ? (gasStart - gasleft() + gasRefundOverhead) : 0;
            
            if (gasUsed > 0) {
                // Calculate refund amount in USDC
                refundAmount = (gasUsed * ratePerGas) / 1e18 + fixedFee;
                
                // Cap at max if specified
                if (maxRefundAmount > 0 && refundAmount > maxRefundAmount) {
                    refundAmount = maxRefundAmount;
                }
                
                // Determine recipient
                recipient = refundRecipient == 0 ? tx.origin : FEE_RECIPIENT;
            }
        }
        
        // Pay refund if we calculated a valid amount
        uint256 paidAmount = 0;
        if (refundAmount > 0 && recipient != address(0)) {
            uint256 payAmount = refundAmount <= moduleDeposit ? refundAmount : moduleDeposit;
            token.safeTransfer(recipient, payAmount);
            paidAmount = payAmount;
        }
        
        // ALWAYS return any remaining balance to the Safe
        uint256 remainder = token.balanceOf(address(this));
        if (remainder > 0) {
            token.safeTransfer(safe, remainder);
        }

        emit GasRefundProcessed(safe, usdcToken, paidAmount, recipient != address(0) ? recipient : safe);
    }

    /// @notice Safely get refund rate from gas price adaptor
    /// @dev Returns (0, 0) if the call fails instead of reverting
    function _safeGetRefundRate() internal view returns (uint256 ratePerGas, uint256 fixedFee) {
        try IGasPriceAdaptor(gasPriceAdaptor).getRefundRate(usdcToken, msg.data) 
            returns (uint256 rate, uint256 fee) 
        {
            return (rate, fee);
        } catch {
            return (0, 0);
        }
    }

    // Oracle math is implemented in the adaptor

    /// @notice Finds the chain sequence for the current chain and expected nonce
    /// @param _sequences Array of chain sequences
    /// @param _chainId Target chain ID
    /// @param _expectedNonce Expected sequence nonce
    /// @return The matching chain sequence
    function _findChainSequence(
        ITyped.ChainSequence[] memory _sequences,
        uint256 _chainId,
        uint256 _expectedNonce
    ) internal pure returns (ITyped.ChainSequence memory) {
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
    function _validateSequenceActionsAndDetectRefund(ITyped.Sequence memory _sequence, uint8 _refundRecipient)
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
            ITyped.ActionDefinition memory expectedAction = _sequence.actions[idx];
            
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
                // Enforce valid refund recipient at module-level: 0=executor, 1=fee recipient
                if (!(_refundRecipient == 0 || _refundRecipient == 1)) {
                    revert Errors.EIP712TypedDataSafeModule_InvalidRefundRecipient(_refundRecipient);
                }
                hasRefundAction = true;
            }
        }
    }

    // Gas refunds are processed by this module when enabled; a fee action deposits the refund token before execution.


    // =============================================================
    //                    EIP-712 HASHING HELPERS
    // =============================================================

    /// @notice Hash an ActionDefinition following proven EIP-712 patterns
    // Hash helpers are implemented in the library
} 