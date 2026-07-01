// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Errors} from "../Errors.sol";
import {IActionBase} from "../interfaces/IActionBase.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {IAuthRegistry} from "../interfaces/IAuthRegistry.sol";
import {IBravaSafeModule} from "../interfaces/IBravaSafeModule.sol";
import {IEip712TypedDataSafeModule as ITyped} from "../interfaces/IEip712TypedDataSafeModule.sol";
import {IGasPriceAdaptor} from "../interfaces/IGasPriceAdaptor.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IOwnerManager} from "../interfaces/safe/IOwnerManager.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";
import {ISequenceExecutor} from "../interfaces/ISequenceExecutor.sol";
import {EIP712TypedDataLib} from "../libraries/EIP712TypedDataLib.sol";
import {Enum} from "../libraries/Enum.sol";

/// @title EIP712TypedDataSafeModule
/// @author Brava Finance
/// @notice Safe module that handles EIP-712 typed data signing for cross-chain bundle execution.
///         Verifies packed multi-signatures against Safe owners, co-signers, and managers
///         (sourced from AuthRegistry) and forwards validated sequences to the sequence executor.
///         Includes optional gas refund functionality with economic protections.
/// @dev Auth state is owned by the per-chain AuthRegistry. The module reads from the registry for
///      the signer gate and writes through the registry when an Owner-signed bundle carries an
///      `authUpdate`. The registry survives module upgrades, so re-deploying the module does not
///      lose auth state.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract EIP712TypedDataSafeModule is ERC165, ReentrancyGuard {
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // These are effectively immutable (set once in initializeConfig, guarded by `isInitialized`).
    // SCREAMING_CASE signals "treat as constant" despite using the two-step init pattern.
    /* solhint-disable var-name-mixedcase */
    /// @notice Reference to the AdminVault for action lookups and logger access.
    IAdminVault public ADMIN_VAULT;
    /// @notice Address of the SequenceExecutor contract used for delegatecall execution.
    address public SEQUENCE_EXECUTOR_ADDR;
    /// @notice Safe deployment factory for deterministic CREATE2 Safe addresses.
    ISafeDeployment public SAFE_DEPLOYMENT;
    /// @notice Address receiving protocol fees from gas refunds.
    address public FEE_RECIPIENT;
    /* solhint-enable var-name-mixedcase */
    /// @notice USDC token address used for gas refund payments.
    address public usdcToken;

    /// @notice The address authorised to call initializeConfig (set at deploy time).
    address public immutable CONFIG_SETTER;

    /// @notice Cached selector for ISequenceExecutor.executeSequence.
    bytes4 public constant EXECUTE_SEQUENCE_SELECTOR = ISequenceExecutor.executeSequence.selector;

    /// @notice Upper bound on signatures per bundle. AuthRegistry caps are MAX_MANAGERS_PER_SAFE=10
    ///         and MAX_COSIGNERS_PER_SAFE=10. With the single-manager rule, the practical max is
    ///         1 owner + 10 managers + 10 co-signers = 21. 32 is generous headroom (allows future
    ///         cap increases without redeploying this module) while bounding worst-case verification
    ///         gas (~6-10k per ECDSA recovery) for fork simulators and off-chain estimators.
    uint256 public constant MAX_SIGNATURES_PER_BUNDLE = 32;

    /// @notice EIP-712 domain name used in the domain separator.
    string public domainName;
    /// @notice EIP-712 domain version used in the domain separator.
    string public domainVersion;

    /// @notice Whether initializeConfig has been called.
    bool public isInitialized;

    /// @notice Monotonically increasing nonce per Safe, consumed on each sequence execution.
    mapping(address => uint256) public sequenceNonces;

    /// @notice Fixed gas overhead added to refund calculations (covers post-execution bookkeeping).
    uint256 public gasRefundOverhead;
    /// @notice Address of the gas price adaptor contract providing refund rate quotes.
    address public gasPriceAdaptor;

    /// @notice Per-chain canonical store of managers, co-signers, and thresholds.
    IAuthRegistry public authRegistry;

    /// @notice Deploys the module with a designated config setter.
    /// @param _configSetter Address authorised to call initializeConfig (typically deployer multisig)
    constructor(address _configSetter) {
        require(_configSetter != address(0), "Invalid input");
        CONFIG_SETTER = _configSetter;
    }

    modifier onlyInitialized() {
        require(isInitialized, "Config not initialized");
        _;
    }

    /// @notice One-time initializer to set all external references and domain fields.
    ///         Can only be called once by the CONFIG_SETTER address.
    /// @param _adminVault AdminVault address
    /// @param _sequenceExecutor SequenceExecutor address
    /// @param _safeDeployment SafeDeployment factory address
    /// @param _feeRecipient Protocol fee recipient address
    /// @param _usdcToken USDC token address for gas refund payments
    /// @param _gasPriceAdaptor Gas price adaptor contract address
    /// @param _gasRefundOverhead Fixed gas overhead for refund calculations
    /// @param _authRegistry AuthRegistry address
    /// @param _domainName EIP-712 domain name
    /// @param _domainVersion EIP-712 domain version
    function initializeConfig(
        address _adminVault,
        address _sequenceExecutor,
        address _safeDeployment,
        address _feeRecipient,
        address _usdcToken,
        address _gasPriceAdaptor,
        uint256 _gasRefundOverhead,
        address _authRegistry,
        string calldata _domainName,
        string calldata _domainVersion
    ) external {
        require(msg.sender == CONFIG_SETTER, "Unauthorized");
        require(!isInitialized, "Already initialized");
        require(
            _adminVault != address(0) &&
            _sequenceExecutor != address(0) &&
            _safeDeployment != address(0) &&
            _feeRecipient != address(0) &&
            _usdcToken != address(0) &&
            _gasPriceAdaptor != address(0) &&
            _authRegistry != address(0),
            "Invalid input"
        );

        ADMIN_VAULT = IAdminVault(_adminVault);
        SEQUENCE_EXECUTOR_ADDR = _sequenceExecutor;
        SAFE_DEPLOYMENT = ISafeDeployment(_safeDeployment);
        FEE_RECIPIENT = _feeRecipient;
        usdcToken = _usdcToken;
        gasPriceAdaptor = _gasPriceAdaptor;
        gasRefundOverhead = _gasRefundOverhead;
        authRegistry = IAuthRegistry(_authRegistry);
        domainName = _domainName;
        domainVersion = _domainVersion;
        isInitialized = true;
    }

    /// @notice ERC-165 interface support check.
    /// @param interfaceId The interface identifier to query
    /// @return True if this contract supports the given interface
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            interfaceId == type(IBravaSafeModule).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// @notice Executes a validated bundle for the current chain and nonce.
    ///         Flow: recover signers → deploy Safe if requested → classify signers → verify
    ///         thresholds → apply auth update → execute sequence.
    ///         Safe deployment is resolved before signer classification so that the classification
    ///         loop always operates on a deployed Safe with a real owner list and registry state.
    /// @dev `nonReentrant` blocks any re-entry into bundle execution within the same transaction.
    ///      The guard is contract-wide rather than per-Safe: legitimate concurrency across Safes
    ///      happens in separate transactions (unaffected), and no in-protocol flow nests an
    ///      `executeBundle` inside an executing sequence — the CCTP relay enters via its own
    ///      top-level transaction. A manager-controlled action calling back into the module is
    ///      therefore the only re-entry path, and it is rejected.
    /// @param _safeAddr The Safe address to execute on
    /// @param _bundle The bundle containing sequences for multiple chains and optional auth update
    /// @param _signatures Packed EIP-712 signatures sorted by signer address ascending.
    ///        Each signature is 65 bytes (r[32] || s[32] || v[1]).
    function executeBundle(
        address _safeAddr,
        ITyped.Bundle calldata _bundle,
        bytes calldata _signatures
    ) external nonReentrant onlyInitialized {
        uint256 gasStart = gasleft();

        if (_bundle.expiry < block.timestamp + 1) {
            revert Errors.EIP712TypedDataSafeModule_BundleExpired();
        }

        bytes32 digest = EIP712TypedDataLib.hashBundleForSigning(domainName, domainVersion, _safeAddr, _bundle);

        uint256 expectedSequenceNonce = sequenceNonces[_safeAddr];

        address[] memory signers = _recoverSigners(digest, _signatures);

        _deploySafeIfRequired(_safeAddr, _bundle.sequences, signers, expectedSequenceNonce);

        (bool hasOwner, bool hasManager, address managerAddr, uint256 coSignCount) = _classifySigners(_safeAddr, signers);

        _verifyThresholds(_safeAddr, hasOwner, hasManager, coSignCount);

        _applyAuthUpdate(_safeAddr, _bundle.authUpdate, hasOwner, hasManager, signers[0]);

        (bool hasSequence, ITyped.ChainSequence memory targetSeq) = _tryFindChainSequence(
            _bundle.sequences, block.chainid, expectedSequenceNonce
        );
        if (!hasSequence) return;

        if (hasManager && !hasOwner) {
            _enforceManagerRestrictions(_safeAddr, managerAddr, targetSeq.sequence);
        }

        _executeChainSequence(_safeAddr, _bundle, _signatures, expectedSequenceNonce, gasStart, targetSeq);
    }

    /// @notice Recovers all signer addresses from packed signatures and validates ordering.
    ///      Pure ECDSA recovery — no Safe state required.
    ///      OpenZeppelin's ECDSA.recover rejects high-s values and v not in {27, 28}, which
    ///      guarantees signature uniqueness per (digest, signer). This is load-bearing for the
    ///      strict-ascending address sort — without it, the same signer could produce two valid
    ///      but distinct (r, s, v) tuples and bypass the duplicate check.
    /// @param _digest The EIP-712 bundle digest that was signed
    /// @param _signatures Packed 65-byte signatures sorted by signer address ascending
    /// @return signers Recovered signer addresses in ascending order
    function _recoverSigners(
        bytes32 _digest,
        bytes calldata _signatures
    ) internal pure returns (address[] memory signers) {
        if (_signatures.length % 65 != 0) {
            revert Errors.EIP712TypedDataSafeModule_InvalidSignaturesLength();
        }

        uint256 sigCount = _signatures.length / 65;
        if (sigCount == 0) {
            revert Errors.EIP712TypedDataSafeModule_InvalidSignaturesLength();
        }
        if (sigCount > MAX_SIGNATURES_PER_BUNDLE) {
            revert Errors.EIP712TypedDataSafeModule_TooManySignatures(sigCount, MAX_SIGNATURES_PER_BUNDLE);
        }

        signers = new address[](sigCount);
        address prevSigner;

        for (uint256 i; i < sigCount; ++i) {
            bytes memory sig = _signatures[i * 65:(i + 1) * 65];
            address signer = _digest.recover(sig);
            if (signer == address(0)) {
                revert Errors.EIP712TypedDataSafeModule_InvalidSignature();
            }

            if (i > 0) {
                if (signer == prevSigner) {
                    revert Errors.EIP712TypedDataSafeModule_DuplicateSigner(signer);
                }
                if (signer < prevSigner) {
                    revert Errors.EIP712TypedDataSafeModule_SignersNotSorted();
                }
            }
            prevSigner = signer;
            signers[i] = signer;
        }
    }

    /// @notice Deploys the Safe if the target chain sequence has `deploySafe=true` and the Safe
    ///         does not yet exist. Called after signature recovery but before signer classification
    ///         so that classification always operates on a deployed Safe.
    ///         Finds the owner among the recovered signers by matching `predictSafeAddress`.
    /// @param _safeAddr The expected Safe address
    /// @param _sequences All chain sequences in the bundle
    /// @param _signers Recovered signer addresses (from _recoverSigners)
    /// @param _expectedNonce The current expected nonce for this Safe
    function _deploySafeIfRequired(
        address _safeAddr,
        ITyped.ChainSequence[] calldata _sequences,
        address[] memory _signers,
        uint256 _expectedNonce
    ) internal {
        if (_safeAddr.code.length > 0) return;

        (bool found, ITyped.ChainSequence memory targetSequence) = _tryFindChainSequence(
            _sequences, block.chainid, _expectedNonce
        );
        if (!found || !targetSequence.deploySafe) return;

        address owner = _findSignerByPredictedSafe(_safeAddr, _signers);

        if (!SAFE_DEPLOYMENT.isSafeDeployed(owner)) {
            // solhint-disable-next-line no-empty-blocks
            try SAFE_DEPLOYMENT.deploySafe(owner) {} catch {
                revert Errors.EIP712TypedDataSafeModule_SafeDeploymentFailed();
            }
        }
    }

    /// @notice Finds the signer whose predicted Safe address matches `_safeAddr`.
    ///         Used during Safe deployment to identify the owner among recovered signers.
    /// @param _safeAddr The expected Safe address
    /// @param _signers Array of recovered signer addresses
    /// @return The signer whose predicted Safe matches _safeAddr
    function _findSignerByPredictedSafe(
        address _safeAddr,
        address[] memory _signers
    ) internal view returns (address) {
        for (uint256 i; i < _signers.length; ++i) {
            if (SAFE_DEPLOYMENT.predictSafeAddress(_signers[i]) == _safeAddr) {
                return _signers[i];
            }
        }
        revert Errors.EIP712TypedDataSafeModule_SafeAddressMismatch(_safeAddr, address(0));
    }

    /// @notice Classifies each recovered signer against the Safe's owner list and AuthRegistry.
    ///         The Safe MUST be deployed before this is called — classification queries
    ///         IOwnerManager.isOwner on-chain.
    ///      Owner classification is strictly highest priority. If the same address is both a Safe
    ///      owner and a registered co-signer/manager, it is always classified as Owner.
    /// @param _safeAddr The deployed Safe whose owner list is used for classification
    /// @param _signers Recovered signer addresses (from _recoverSigners)
    /// @return hasOwner True if at least one signer is a Safe owner
    /// @return hasManager True if at least one signer is a registered manager
    /// @return managerAddr The manager address (address(0) if no manager)
    /// @return coSignCount Number of co-signer signatures (does NOT include owner or manager)
    function _classifySigners(
        address _safeAddr,
        address[] memory _signers
    ) internal view returns (
        bool hasOwner,
        bool hasManager,
        address managerAddr,
        uint256 coSignCount
    ) {
        for (uint256 i; i < _signers.length; ++i) {
            address signer = _signers[i];
            if (IOwnerManager(_safeAddr).isOwner(signer)) {
                hasOwner = true;
            } else if (authRegistry.isCoSigner(_safeAddr, signer)) {
                ++coSignCount;
            } else if (authRegistry.isManager(_safeAddr, signer)) {
                if (hasManager) {
                    revert Errors.EIP712TypedDataSafeModule_MultipleManagers();
                }
                hasManager = true;
                managerAddr = signer;
            } else {
                revert Errors.EIP712TypedDataSafeModule_SignerNotAuthorised(signer);
            }
        }
    }

    /// @notice Verifies that at least one authorising principal (owner or manager) is present and
    ///         that manager bundles meet the co-signing threshold. Co-signers alone can never
    ///         authorise a bundle — they exist solely to co-sign with a manager.
    ///      Note: when both _hasOwner and _hasManager are true, the manager threshold is still
    ///      checked. This is intentional — an Owner's legitimate bundle will never contain a
    ///      manager signature. If a third party appends a manager sig to an Owner-signed digest,
    ///      the revert only affects their own transaction; the Owner's original bundle is unaffected.
    /// @param _safeAddr The Safe whose threshold to check
    /// @param _hasOwner Whether an owner signature is present
    /// @param _hasManager Whether a manager signature is present
    /// @param _coSignCount Number of co-signer signatures in the bundle
    function _verifyThresholds(
        address _safeAddr,
        bool _hasOwner,
        bool _hasManager,
        uint256 _coSignCount
    ) internal view {
        if (!_hasOwner && !_hasManager) {
            revert Errors.EIP712TypedDataSafeModule_NoAuthorisingPrincipal();
        }

        if (_hasManager) {
            uint256 required = authRegistry.getManagerCoSignThreshold(_safeAddr);
            if (_coSignCount < required) {
                revert Errors.EIP712TypedDataSafeModule_InsufficientCoSignatures(_coSignCount, required);
            }
        }
    }

    /// @notice Enforces per-manager action type restrictions for manager-signed bundles.
    ///         Checks each action in the sequence against the manager's allowed action types.
    /// @param _safeAddr The Safe whose registry is queried
    /// @param _manager The manager address whose restrictions are enforced
    /// @param _sequence The sequence whose actions are being checked
    function _enforceManagerRestrictions(
        address _safeAddr,
        address _manager,
        ITyped.Sequence memory _sequence
    ) internal view {
        for (uint256 i; i < _sequence.actions.length; ++i) {
            uint8 actionType = _sequence.actions[i].actionType;
            if (!authRegistry.isActionTypeAllowed(_safeAddr, _manager, actionType)) {
                revert Errors.EIP712TypedDataSafeModule_ActionTypeNotAllowedForManager(_manager, actionType);
            }
        }
    }

    /// @notice Applies an auth config update from the bundle if present (newVersion != 0).
    ///         Only Owner-signed bundles (no manager) may carry auth updates.
    ///         Intentionally runs BEFORE the chain-sequence check and BEFORE sequence execution so that:
    ///         (a) an Owner bundle can propagate auth to any chain it's submitted on (cross-chain auth),
    ///         (b) any `CCTPBridgeSend(propagateAuth=true)` in the sequence emits the post-update snapshot.
    ///      Replay safety: version-monotonic + expiry + per-Safe nonce (on sequence execution).
    /// @param _safeAddr The Safe to update auth config for
    /// @param _update The auth update payload (newVersion == 0 means no-op)
    /// @param _hasOwner Whether an owner signature is present
    /// @param _hasManager Whether a manager signature is present
    /// @param _firstSigner The lowest-address signer (signers are sorted ascending). Emitted in the
    ///        revert for diagnostic correlation — it is NOT necessarily the signer who "caused" the
    ///        failure (e.g. a cosigner could be the lowest address).
    function _applyAuthUpdate(
        address _safeAddr,
        ITyped.AuthUpdate calldata _update,
        bool _hasOwner,
        bool _hasManager,
        address _firstSigner
    ) internal {
        if (_update.newVersion == 0) return;

        if (!_hasOwner || _hasManager) {
            revert Errors.EIP712TypedDataSafeModule_OnlyOwnerCanUpdateAuth(_firstSigner);
        }
        authRegistry.setAuthConfig(
            _safeAddr,
            _update.newVersion,
            _update.newManagers,
            _update.newCoSigners,
            _update.managerCoSignThreshold,
            _update.managerRestrictions
        );
    }

    /// @notice Executes the chain sequence for the current chain.
    /// @param _safeAddr The Safe to execute through
    /// @param _bundle The full bundle (needed for execThroughSafe passthrough)
    /// @param _signatures The packed signatures (passed through to executor)
    /// @param _expectedSequenceNonce The nonce this execution consumes
    /// @param _gasStart The gasleft() snapshot at bundle entry (for refund calculation)
    /// @param targetSequence The pre-resolved chain sequence for the current chain
    function _executeChainSequence(
        address _safeAddr,
        ITyped.Bundle calldata _bundle,
        bytes calldata _signatures,
        uint256 _expectedSequenceNonce,
        uint256 _gasStart,
        ITyped.ChainSequence memory targetSequence
    ) internal {
        (bytes4[] memory actionIds, bool hasRefundAction) = _validateSequenceActionsAndDetectRefund(
            targetSequence.sequence,
            targetSequence.refundRecipient
        );

        _validateRefundFlags(targetSequence.enableGasRefund, hasRefundAction);

        sequenceNonces[_safeAddr] = _expectedSequenceNonce + 1;

        _execThroughSafeOrRevert(
            _safeAddr,
            ISequenceExecutor.Sequence({
                name: targetSequence.sequence.name,
                callData: targetSequence.sequence.callData,
                actionIds: actionIds
            }),
            _bundle,
            _signatures
        );

        if (targetSequence.enableGasRefund) {
            _executeGasRefund(
                _safeAddr,
                targetSequence.maxRefundAmount,
                targetSequence.refundRecipient,
                _gasStart
            );
        }

        _logSequenceComplete(_safeAddr, _bundle.expiry, _expectedSequenceNonce);
    }

    /// @notice Delegates a sequence execution call through the Safe's module interface.
    /// @param safeAddr The Safe to execute through
    /// @param execSeq The prepared executor sequence (name, callData, actionIds)
    /// @param bundle The full bundle (passed through to the executor)
    /// @param signatures The packed signatures (passed through to the executor)
    /// @return success Whether the delegatecall succeeded
    /// @return returnData The raw return data from the call
    function _execThroughSafe(
        address safeAddr,
        ISequenceExecutor.Sequence memory execSeq,
        ITyped.Bundle calldata bundle,
        bytes memory signatures
    ) private returns (bool success, bytes memory returnData) {
        return ISafe(safeAddr).execTransactionFromModuleReturnData(
            SEQUENCE_EXECUTOR_ADDR,
            0,
            abi.encodeWithSelector(
                EXECUTE_SEQUENCE_SELECTOR,
                execSeq,
                bundle,
                signatures,
                uint16(0)
            ),
            Enum.Operation.DelegateCall
        );
    }

    /// @notice Executes a sequence through the Safe via delegatecall, propagating any revert reason on failure.
    /// @param _safeAddr The Safe to execute through
    /// @param _execSeq The prepared executor sequence (name, callData, actionIds)
    /// @param _bundle The full bundle (passed through to the executor)
    /// @param _signatures The packed signatures (passed through to the executor)
    function _execThroughSafeOrRevert(
        address _safeAddr,
        ISequenceExecutor.Sequence memory _execSeq,
        ITyped.Bundle calldata _bundle,
        bytes memory _signatures
    ) internal {
        (bool ok, bytes memory returnData) = _execThroughSafe(_safeAddr, _execSeq, _bundle, _signatures);
        if (!ok) {
            if (returnData.length > 0) {
                // solhint-disable-next-line no-inline-assembly
                assembly {
                    revert(add(returnData, 0x20), mload(returnData))
                }
            }
            revert Errors.EIP712TypedDataSafeModule_ExecutionFailed();
        }
    }

    /// @notice Returns the current sequence nonce for a Safe.
    /// @param _safeAddr The Safe to query
    /// @return The current nonce (next expected nonce for bundle execution)
    function getSequenceNonce(address _safeAddr) external view returns (uint256) {
        return sequenceNonces[_safeAddr];
    }

    /// @notice Computes the EIP-712 domain separator for a given Safe.
    /// @param _safeAddr The Safe address used as the verifyingContract
    /// @return The domain separator hash
    function getDomainSeparator(address _safeAddr) external view returns (bytes32) {
        return EIP712TypedDataLib.domainSeparator(domainName, domainVersion, _safeAddr);
    }

    /// @notice Computes the full EIP-712 signing hash for a bundle (domain separator + struct hash).
    /// @param _safeAddr The Safe address used as verifyingContract in the domain
    /// @param _bundle The bundle to hash
    /// @return The digest that signers must sign
    function getBundleHash(address _safeAddr, ITyped.Bundle calldata _bundle) external view returns (bytes32) {
        return EIP712TypedDataLib.hashBundleForSigning(domainName, domainVersion, _safeAddr, _bundle);
    }

    /// @notice Computes the struct hash of a bundle (without domain separator).
    /// @param _bundle The bundle to hash
    /// @return The EIP-712 struct hash
    function getRawBundleHash(ITyped.Bundle calldata _bundle) external pure returns (bytes32) {
        return EIP712TypedDataLib.hashBundle(_bundle);
    }

    /// @notice Searches for a chain sequence matching the given chain ID and nonce.
    /// @param _sequences All chain sequences in the bundle
    /// @param _chainId The chain ID to look for
    /// @param _expectedNonce The expected sequence nonce
    /// @return found True if a matching sequence exists
    /// @return seq The matching ChainSequence (undefined when found=false)
    function _tryFindChainSequence(
        ITyped.ChainSequence[] memory _sequences,
        uint256 _chainId,
        uint256 _expectedNonce
    ) internal pure returns (bool found, ITyped.ChainSequence memory seq) {
        for (uint256 i = 0; i < _sequences.length; ++i) {
            if (_sequences[i].chainId == _chainId && _sequences[i].sequenceNonce == _expectedNonce) {
                return (true, _sequences[i]);
            }
        }
    }

    /// @notice Calculates and executes a gas refund in USDC using the gas price adaptor's rate.
    /// @param safe The Safe that owns the USDC used for the refund
    /// @param maxRefundAmount Bundle-level cap on the refund amount (0 = no cap)
    /// @param refundRecipient 0 = refund to tx.origin, non-zero = refund to FEE_RECIPIENT
    /// @param gasStart The gasleft() snapshot captured at the start of bundle execution
    function _executeGasRefund(
        address safe,
        uint256 maxRefundAmount,
        uint8 refundRecipient,
        uint256 gasStart
    ) internal {
        IERC20 token = IERC20(usdcToken);
        uint256 moduleDeposit = token.balanceOf(address(this));

        if (moduleDeposit == 0) return;

        uint256 refundAmount = 0;
        address recipient = address(0);

        (uint256 ratePerGas, uint256 fixedFee) = _getRefundRate();

        if (ratePerGas > 0) {
            uint256 gasUsed = gasStart > gasleft() ? (gasStart - gasleft() + gasRefundOverhead) : 0;

            if (gasUsed > 0) {
                refundAmount = (gasUsed * ratePerGas) / 1e18 + fixedFee;

                if (maxRefundAmount > 0 && refundAmount > maxRefundAmount) {
                    refundAmount = maxRefundAmount;
                }

                // solhint-disable-next-line avoid-tx-origin
                recipient = refundRecipient == 0 ? tx.origin : FEE_RECIPIENT;
            }
        }

        uint256 paidAmount = 0;
        if (refundAmount > 0 && recipient != address(0)) {
            uint256 payAmount = moduleDeposit < refundAmount ? moduleDeposit : refundAmount;
            token.safeTransfer(recipient, payAmount);
            paidAmount = payAmount;
        }

        uint256 remainder = token.balanceOf(address(this));
        if (remainder > 0) {
            token.safeTransfer(safe, remainder);
        }

        _logFinalGasRefund(safe, paidAmount, recipient != address(0) ? recipient : safe);
    }

    /// @notice Emits a SEQUENCE_COMPLETE log event via the AdminVault's logger.
    /// @param safe The Safe that completed the sequence
    /// @param expiry The bundle expiry timestamp
    /// @param sequenceNonce The consumed sequence nonce
    function _logSequenceComplete(address safe, uint256 expiry, uint256 sequenceNonce) internal {
        ILogger(ADMIN_VAULT.LOGGER()).logActionEvent(
            IActionBase.LogType.SEQUENCE_COMPLETE,
            abi.encode(safe, expiry, block.chainid, sequenceNonce)
        );
    }

    /// @notice Emits a GAS_REFUND log event via the AdminVault's logger.
    /// @param safe The Safe that funded the refund
    /// @param paidAmount USDC amount actually transferred
    /// @param recipient Address that received the refund
    function _logFinalGasRefund(address safe, uint256 paidAmount, address recipient) internal {
        ILogger(ADMIN_VAULT.LOGGER()).logActionEvent(
            IActionBase.LogType.GAS_REFUND,
            abi.encode(safe, usdcToken, paidAmount, recipient)
        );
    }

    /// @notice Queries the gas price adaptor for the current refund rate.
    /// @return ratePerGas USDC wei per gas unit
    /// @return fixedFee Flat USDC fee added on top of the variable rate
    function _getRefundRate() internal view returns (uint256 ratePerGas, uint256 fixedFee) {
        return IGasPriceAdaptor(gasPriceAdaptor).getRefundRate(usdcToken, msg.data);
    }

    /// @notice Validates each action in a sequence against its on-chain definition and detects gas refund actions.
    /// @param _sequence The sequence whose actions are being validated
    /// @param _refundRecipient Non-zero if the bundle expects a gas refund (used to detect refund actions)
    /// @return actionIds The validated action ID selectors
    /// @return hasRefundAction True if one of the actions is a gas refund action
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

        for (uint256 i; i < _sequence.actions.length; ++i) {
            bytes4 actionId = _sequence.actionIds[i];

            address actionAddr = ADMIN_VAULT.getActionAddress(actionId);
            if (actionAddr == address(0)) {
                revert Errors.EIP712TypedDataSafeModule_ActionNotFound(actionId);
            }

            IActionBase action = IActionBase(actionAddr);
            string memory actualProtocolName = action.protocolName();
            uint8 actualActionType = action.actionType();

            ITyped.ActionDefinition memory expectedAction = _sequence.actions[i];

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

            if (!hasRefundAction && actualActionType == uint8(IActionBase.ActionType.FEE_ACTION)) {
                if (!(_refundRecipient == 0 || _refundRecipient == 1)) {
                    revert Errors.EIP712TypedDataSafeModule_InvalidRefundRecipient(_refundRecipient);
                }
                hasRefundAction = true;
            }
        }
    }

    /// @notice Validates that gas refund flags are consistent with detected refund actions.
    /// @param _enableGasRefund Whether the chain sequence has gas refund enabled
    /// @param _hasRefundAction Whether a refund action was detected in the sequence
    function _validateRefundFlags(bool _enableGasRefund, bool _hasRefundAction) internal pure {
        if (_enableGasRefund && !_hasRefundAction) {
            revert Errors.EIP712TypedDataSafeModule_RefundActionRequired();
        }
        if (!_enableGasRefund && _hasRefundAction) {
            revert Errors.EIP712TypedDataSafeModule_RefundActionNotAllowed();
        }
    }

    // =============================================================
    //                    GAS ESTIMATION HELPER
    // =============================================================

    /// @notice Reverted at the end of estimateBundleGas to return the gas measurement without committing state.
    /// @param gasUsed The estimated gas consumed by the bundle execution
    error SimulationComplete(uint256 gasUsed);

    /// @notice Estimates gas for a bundle without requiring a signature.
    ///         Uses msg.sender as the presumed Safe owner for deployment prediction.
    ///         All state mutations are rolled back via `revert SimulationComplete(...)`.
    /// @param _safeAddr The Safe to simulate execution for
    /// @param _bundle The bundle to estimate gas for
    function estimateBundleGas(
        address _safeAddr,
        ITyped.Bundle calldata _bundle
    ) external onlyInitialized {
        uint256 gasStart = gasleft();

        uint256 expectedSequenceNonce = sequenceNonces[_safeAddr];

        (bool hasSequence, ITyped.ChainSequence memory targetSequence) = _tryFindChainSequence(
            _bundle.sequences, block.chainid, expectedSequenceNonce
        );
        if (!hasSequence) revert SimulationComplete(0);

        if (targetSequence.deploySafe) {
            _deploySafeForEstimation(_safeAddr, msg.sender);
        }

        _applySimulationAuthUpdate(_safeAddr, _bundle.authUpdate);

        (bytes4[] memory actionIds, bool hasRefundAction) = _validateSequenceActionsAndDetectRefund(
            targetSequence.sequence,
            targetSequence.refundRecipient
        );

        _validateRefundFlags(targetSequence.enableGasRefund, hasRefundAction);

        _execThroughSafeOrRevert(
            _safeAddr,
            ISequenceExecutor.Sequence({
                name: targetSequence.sequence.name,
                callData: targetSequence.sequence.callData,
                actionIds: actionIds
            }),
            _bundle,
            new bytes(0)
        );

        uint256 gasUsed = gasStart - gasleft();

        if (targetSequence.enableGasRefund) {
            gasUsed += gasRefundOverhead;
        }

        revert SimulationComplete(gasUsed);
    }

    /// @notice Deploys a Safe for gas estimation using msg.sender as the presumed owner.
    /// @param _safeAddr The expected Safe address
    /// @param _signer The presumed owner (msg.sender in estimation context)
    function _deploySafeForEstimation(address _safeAddr, address _signer) internal {
        address predictedSafeAddr = SAFE_DEPLOYMENT.predictSafeAddress(_signer);
        if (_safeAddr != predictedSafeAddr) {
            revert Errors.EIP712TypedDataSafeModule_SafeAddressMismatch(_safeAddr, predictedSafeAddr);
        }
        if (!SAFE_DEPLOYMENT.isSafeDeployed(_signer)) {
            // solhint-disable-next-line no-empty-blocks
            try SAFE_DEPLOYMENT.deploySafe(_signer) {} catch {
                revert Errors.EIP712TypedDataSafeModule_SafeDeploymentFailed();
            }
        }
    }

    /// @notice Applies an auth update during gas estimation (no owner/manager gating).
    /// @param _safeAddr The Safe to update auth config for
    /// @param _update The auth update payload (newVersion == 0 means no-op)
    function _applySimulationAuthUpdate(
        address _safeAddr,
        ITyped.AuthUpdate calldata _update
    ) internal {
        if (_update.newVersion == 0) return;
        authRegistry.setAuthConfig(
            _safeAddr,
            _update.newVersion,
            _update.newManagers,
            _update.newCoSigners,
            _update.managerCoSignThreshold,
            _update.managerRestrictions
        );
    }

    /// @notice Rejects direct ETH transfers to prevent accidental locking.
    receive() external payable {
        revert("ETH not accepted");
    }
}
