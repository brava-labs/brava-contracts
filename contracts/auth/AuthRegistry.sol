// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ActionBase} from "../actions/ActionBase.sol";
import {Errors} from "../Errors.sol";
import {BravaModuleLookup} from "./BravaModuleLookup.sol";
import {IBravaSafeModule} from "../interfaces/IBravaSafeModule.sol";
import {IEip712TypedDataSafeModule as ITyped} from "../interfaces/IEip712TypedDataSafeModule.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";

/// @title IMessageTransmitterV2
/// @author Brava Finance
/// @notice Minimal external interface for Circle MessageTransmitter V2.
interface IMessageTransmitterV2 {
    /// @notice Receives and verifies a Circle-attested cross-chain message.
    /// @param message Encoded CCTP V2 message.
    /// @param attestation Circle attestation proving the message was finalized.
    /// @return success True when the transmitter accepts and consumes the message.
    function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool);
}

/// @title AuthRegistry
/// @author Brava Finance
/// @notice Per-chain registry of authorised managers, co-signers, and co-signing thresholds per Safe,
///         plus a monotonic version counter. Canonical state consulted by the EIP-712 module's signer gate.
/// @dev Three write paths share the same `_apply` enforcement (length cap, zero/duplicate checks,
///      version-monotonic with idempotent equality, threshold validation):
///        1. `setAuthConfig`            — module-only; caller must currently be enabled as a module
///                                        on the target Safe. Survives module upgrades because the
///                                        registry never binds to a single module address.
///        2. `receiveCCTPAuthUpdate`    — permissionless; verifies a Circle attestation and
///                                        triple-checks burnSender == hookSafe == mintRecipient
///                                        before applying the snapshot. No bundle execution.
///        3. `relayCCTPAndExecute`      — permissionless; same trust path as (2), then best-effort
///                                        forwards an EIP-712-signed bundle to the destination
///                                        Safe's currently-enabled Brava module (discovered via
///                                        ERC-165). Combines fund mint, auth propagation, and
///                                        bundle execution into a single attested message.
/// @notice Auth-config state changes are logged via the shared Logger (logId 209).
///         CCTP relay outcomes are logged separately via LogType.CCTP_RELAY_AND_EXECUTE.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract AuthRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Hard cap on the number of managers per Safe.
    uint256 public constant MAX_MANAGERS_PER_SAFE = 10;

    /// @notice Hard cap on the number of co-signers per Safe.
    uint256 public constant MAX_COSIGNERS_PER_SAFE = 10;

    /// @notice AdminVaultEvent logId emitted on every state mutation.
    uint256 private constant LOG_ID_AUTH_CONFIG_UPDATED = 209;

    /// @notice CCTP V2 message header size in bytes.
    uint256 private constant MESSAGE_HEADER_SIZE = 148;

    /// @notice CCTP V2 BurnMessage fixed-fields size in bytes (preceding the optional hookData).
    uint256 private constant BURN_MESSAGE_FIXED_SIZE = 228;

    /// @notice Byte offset of the source-domain field within a CCTP V2 message.
    uint256 private constant SOURCE_DOMAIN_OFFSET = 4;

    /// @notice Byte offset of the nonce field within a CCTP V2 message (bytes32).
    uint256 private constant NONCE_OFFSET = 12;

    /// @notice Byte offset of `BurnMessage.mintRecipient` within a CCTP V2 message.
    uint256 private constant BURN_MINT_RECIPIENT_OFFSET = 184;

    /// @notice Byte offset of `BurnMessage.messageSender` (the burner) within a CCTP V2 message.
    uint256 private constant BURN_MESSAGE_SENDER_OFFSET = 248;

    /// @notice Minimum valid hook envelope size: `abi.encode(uint8, bytes)` with empty bytes payload
    ///         occupies 3 head words (hookVersion, offset, length).
    uint256 private constant HOOK_ENVELOPE_MIN_SIZE = 96;

    /// @notice Logger contract receiving all auth config update events.
    ILogger public immutable LOGGER;

    /// @notice Circle MessageTransmitter V2 — sole trusted source for cross-chain auth updates.
    address public immutable MESSAGE_TRANSMITTER;

    /// @notice Safe factory for deterministic CREATE2 deployment in the relay path.
    ISafeDeployment public immutable SAFE_DEPLOYMENT;

    struct AuthConfig {
        uint256 version;
        EnumerableSet.AddressSet managers;
        EnumerableSet.AddressSet coSigners;
        uint256 managerCoSignThreshold;
    }
    mapping(address safe => AuthConfig) private _state;

    /// @notice Per-manager action type bitmap. Bit N set = ActionType(N) is allowed.
    ///         A zero bitmap means unrestricted (manager can execute any action type).
    mapping(address safe => mapping(address manager => uint256)) private _actionTypeBitmaps;

    /// @notice Initializes the registry with its logger, Circle transmitter, and Safe deployment helper.
    /// @param _logger Logger contract receiving auth config update and relay events.
    /// @param _messageTransmitter Circle MessageTransmitter V2 used to verify CCTP messages.
    /// @param _safeDeployment Safe deployment helper used for optimistic relay-time Safe deployment.
    constructor(address _logger, address _messageTransmitter, address _safeDeployment) {
        require(
            _logger != address(0) && _messageTransmitter != address(0) && _safeDeployment != address(0),
            "Invalid input"
        );
        LOGGER = ILogger(_logger);
        MESSAGE_TRANSMITTER = _messageTransmitter;
        SAFE_DEPLOYMENT = ISafeDeployment(_safeDeployment);
    }

    // =============================
    // Path 1 — owner-signed bundle (via module)
    // =============================
    /// @notice Replaces the full auth config for a Safe at a new version. Intended caller is the
    ///         EIP-712 module after it has verified the bundle signer is an Owner of the Safe.
    /// @param _safe Safe whose auth config is being replaced.
    /// @param _newVersion Monotonic config version to apply.
    /// @param _newManagers Complete replacement manager set.
    /// @param _newCoSigners Complete replacement co-signer set.
    /// @param _managerCoSignThreshold Number of co-signers required for manager-signed bundles.
    /// @param _managerRestrictions Per-manager action type restrictions (only restricted managers listed).
    function setAuthConfig(
        address _safe,
        uint256 _newVersion,
        address[] calldata _newManagers,
        address[] calldata _newCoSigners,
        uint256 _managerCoSignThreshold,
        ITyped.ManagerRestriction[] calldata _managerRestrictions
    ) external {
        if (!ISafe(_safe).isModuleEnabled(msg.sender)) {
            revert Errors.AuthRegistry_NotEnabledModule(_safe, msg.sender);
        }
        _apply(_safe, _newVersion, _newManagers, _newCoSigners, _managerCoSignThreshold, _managerRestrictions);
    }

    // =============================
    // Path 2 — CCTP cross-chain copy (permissionless relay, no bundle)
    // =============================
    /// @notice Receives a Circle-attested CCTP V2 message carrying an auth config snapshot from the
    ///         source chain and copies it locally.
    /// @param _message Encoded CCTP V2 message containing the burn message and optional hook data.
    /// @param _attestation Circle attestation proving the message was finalized.
    function receiveCCTPAuthUpdate(
        bytes calldata _message,
        bytes calldata _attestation
    ) external {
        (bytes32 burnSender, bytes32 mintRecipient, bytes calldata hookData) = _parseCCTPMessage(_message);

        if (!IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(_message, _attestation)) {
            revert Errors.AuthRegistry_CCTPRelayFailed();
        }

        _applyHookSnapshot(hookData, burnSender, mintRecipient);
    }

    // =============================
    // Path 3 — combined CCTP relay + bundle execution
    // =============================
    /// @notice Mints USDC, optionally applies an auth config snapshot from `_message`'s hookData,
    ///         and then best-effort executes `_bundle` through the destination Safe's currently-enabled
    ///         Brava module.
    /// @param _message Encoded CCTP V2 message containing the mint recipient and optional hook data.
    /// @param _attestation Circle attestation proving the message was finalized.
    /// @param _safe Destination Safe expected to receive the minted funds and execute the bundle.
    /// @param _ownerAddress Owner EOA for optimistic Safe deployment. If non-zero and the Safe
    ///        doesn't exist yet, the relay deploys it after auth apply and before bundle execution.
    ///        Verified via `predictSafeAddress(ownerAddress) == _safe`. Pass `address(0)` to skip.
    /// @param _bundle EIP-712 bundle forwarded to the enabled Brava module.
    /// @param _signatures Signatures authorizing `_bundle` execution.
    /// @return authApplied True when hook data contained and applied an auth snapshot.
    /// @return bundleSuccess True when a Brava module was found and executed `_bundle` without reverting.
    /// @return bundleReturnData Revert data returned by the Brava module when bundle execution fails.
    function relayCCTPAndExecute(
        bytes calldata _message,
        bytes calldata _attestation,
        address _safe,
        address _ownerAddress,
        ITyped.Bundle calldata _bundle,
        bytes calldata _signatures
    ) external returns (bool authApplied, bool bundleSuccess, bytes memory bundleReturnData) {
        (bytes32 cctpNonce, uint32 sourceDomain) = _decodeMessageMetadata(_message);
        _assertSafeMatchesMintRecipient(_message, _safe);
        authApplied = _receiveAndMaybeApply(_message, _attestation);

        if (_ownerAddress != address(0)) {
            _optimisticDeploySafe(_safe, _ownerAddress);
        }

        address module;
        (module, bundleSuccess, bundleReturnData) = _executeBundleBestEffort(_safe, _bundle, _signatures);

        LOGGER.logActionEvent(
            ActionBase.LogType.CCTP_RELAY_AND_EXECUTE,
            abi.encode(_safe, module, authApplied, bundleSuccess, sourceDomain, cctpNonce)
        );
    }

    /// @notice Deploys a Safe when the relay can prove the supplied owner derives the target address.
    /// @dev Deploys the Safe if it doesn't exist, after verifying the owner address produces the
    ///      expected Safe address via CREATE2.
    /// @param _safe Safe address that must match the deployment helper's prediction.
    /// @param _ownerAddress Owner EOA used by the deployment helper to derive the Safe address.
    function _optimisticDeploySafe(address _safe, address _ownerAddress) private {
        address predicted = SAFE_DEPLOYMENT.predictSafeAddress(_ownerAddress);
        if (predicted != _safe) {
            revert Errors.AuthRegistry_SafeOwnerMismatch(_safe, _ownerAddress, predicted);
        }
        if (!SAFE_DEPLOYMENT.isSafeDeployed(_ownerAddress)) {
            SAFE_DEPLOYMENT.deploySafe(_ownerAddress);
        }
    }

    /// @notice Receives a CCTP message and applies its hook snapshot when one is present.
    /// @dev Mints USDC via the Circle attestation and applies any hook-carried snapshot.
    /// @param _message Encoded CCTP V2 message containing the burn message and optional hook data.
    /// @param _attestation Circle attestation proving the message was finalized.
    /// @return authApplied True when hook data contained and applied an auth snapshot.
    function _receiveAndMaybeApply(
        bytes calldata _message,
        bytes calldata _attestation
    ) private returns (bool authApplied) {
        (bytes32 burnSender, bytes32 mintRecipient, bytes calldata hookData) = _parseCCTPMessage(_message);

        if (!IMessageTransmitterV2(MESSAGE_TRANSMITTER).receiveMessage(_message, _attestation)) {
            revert Errors.AuthRegistry_CCTPRelayFailed();
        }

        if (hookData.length > HOOK_ENVELOPE_MIN_SIZE - 1) {
            _applyHookSnapshot(hookData, burnSender, mintRecipient);
            authApplied = true;
        }
    }

    /// @notice Attempts bundle execution through the Safe's currently enabled Brava module.
    /// @dev Looks up the Safe's enabled Brava module via ERC-165 and forwards the bundle.
    ///      Best-effort: if the module reverts (including ABI mismatch if the module's
    ///      executeBundle signature changed — see IBravaSafeModule interfaceId coupling),
    ///      bundleSuccess=false with revert data. Callers distinguish "no module" from
    ///      "module reverted" via the module return value (address(0) vs non-zero).
    /// @param _safe Safe whose enabled Brava module should execute the bundle.
    /// @param _bundle EIP-712 bundle forwarded to the enabled Brava module.
    /// @param _signatures Signatures authorizing `_bundle` execution.
    /// @return module Enabled Brava module used for execution, or address(0) when none is found.
    /// @return bundleSuccess True when a Brava module was found and executed `_bundle` without reverting.
    /// @return bundleReturnData Revert data returned by the Brava module when bundle execution fails.
    function _executeBundleBestEffort(
        address _safe,
        ITyped.Bundle calldata _bundle,
        bytes calldata _signatures
    ) private returns (address module, bool bundleSuccess, bytes memory bundleReturnData) {
        bool found;
        (found, module) = BravaModuleLookup.tryFindEnabledBravaModule(ISafe(_safe));
        if (!found) {
            return (address(0), false, "");
        }
        try IBravaSafeModule(module).executeBundle(_safe, _bundle, _signatures) {
            bundleSuccess = true;
        } catch (bytes memory err) {
            bundleReturnData = err;
        }
    }

    // =============================
    // Internal: CCTP message parsing
    // =============================
    /// @notice Parses the CCTP V2 burn message fields needed by the registry.
    /// @param _message Encoded CCTP V2 message containing a burn message.
    /// @return burnSender Safe address encoded as the burn message sender.
    /// @return mintRecipient Safe address encoded as the mint recipient.
    /// @return hookData Optional hook payload appended to the burn message.
    function _parseCCTPMessage(bytes calldata _message)
        private
        pure
        returns (bytes32 burnSender, bytes32 mintRecipient, bytes calldata hookData)
    {
        uint256 hookDataOffset = MESSAGE_HEADER_SIZE + BURN_MESSAGE_FIXED_SIZE;
        if (_message.length < hookDataOffset) {
            revert Errors.AuthRegistry_HookMessageTooShort();
        }

        burnSender = bytes32(_message[BURN_MESSAGE_SENDER_OFFSET:BURN_MESSAGE_SENDER_OFFSET + 32]);
        mintRecipient = bytes32(_message[BURN_MINT_RECIPIENT_OFFSET:BURN_MINT_RECIPIENT_OFFSET + 32]);
        hookData = _message[hookDataOffset:];
    }

    /// @notice Decodes message header fields used for relay logging.
    /// @dev CCTP V2 nonces are bytes32 (hashes, not counters). Stored as-is for event logging.
    /// @param _message Encoded CCTP V2 message containing the header metadata.
    /// @return cctpNonce CCTP nonce read from the message header.
    /// @return sourceDomain Circle source domain read from the message header.
    function _decodeMessageMetadata(bytes calldata _message)
        private
        pure
        returns (bytes32 cctpNonce, uint32 sourceDomain)
    {
        sourceDomain = uint32(bytes4(_message[SOURCE_DOMAIN_OFFSET:SOURCE_DOMAIN_OFFSET + 4]));
        cctpNonce = bytes32(_message[NONCE_OFFSET:NONCE_OFFSET + 32]);
    }

    /// @notice Requires the requested Safe to match the Circle-attested mint recipient.
    /// @dev Asserts that the caller-supplied `_safe` matches the CCTP message's mintRecipient.
    ///      This is a guardrail ensuring the caller targets the correct Safe — the actual mint
    ///      destination is controlled solely by the Circle-attested message, not by this check.
    /// @param _message Encoded CCTP V2 message containing the mint recipient.
    /// @param _safe Safe address expected to match the message's mint recipient.
    function _assertSafeMatchesMintRecipient(bytes calldata _message, address _safe) private pure {
        bytes32 mintRecipient = bytes32(_message[BURN_MINT_RECIPIENT_OFFSET:BURN_MINT_RECIPIENT_OFFSET + 32]);
        if (address(uint160(uint256(mintRecipient))) != _safe) {
            revert Errors.AuthRegistry_SafeMintRecipientMismatch(_safe, mintRecipient);
        }
    }

    /// @notice Applies the auth snapshot carried in a CCTP hook envelope.
    /// @dev Decodes the hook envelope and applies the carried snapshot after enforcing the
    ///      Safe-identity triple-check.
    /// @param hookData ABI-encoded hook envelope carrying an auth snapshot.
    /// @param burnSender Safe address encoded as the burn message sender.
    /// @param mintRecipient Safe address encoded as the mint recipient.
    function _applyHookSnapshot(
        bytes calldata hookData,
        bytes32 burnSender,
        bytes32 mintRecipient
    ) private {
        if (hookData.length < HOOK_ENVELOPE_MIN_SIZE) revert Errors.AuthRegistry_BadHookEnvelope();
        (uint8 hookVersion, bytes memory payload) = abi.decode(hookData, (uint8, bytes));
        if (hookVersion != 1) revert Errors.AuthRegistry_UnknownHookVersion(hookVersion);

        (
            address safe,
            uint256 newVersion,
            address[] memory newManagers,
            address[] memory newCoSigners,
            uint256 managerCoSignThreshold,
            uint256[] memory managerBitmaps
        ) = abi.decode(payload, (address, uint256, address[], address[], uint256, uint256[]));

        bytes32 safeAsBytes32 = bytes32(uint256(uint160(safe)));
        if (burnSender != safeAsBytes32 || mintRecipient != safeAsBytes32) {
            revert Errors.AuthRegistry_HookSafeMismatch(burnSender, mintRecipient, safe);
        }

        ITyped.ManagerRestriction[] memory restrictions = _bitmapsToRestrictions(newManagers, managerBitmaps);
        _apply(safe, newVersion, newManagers, newCoSigners, managerCoSignThreshold, restrictions);
    }

    /// @notice Converts parallel arrays of managers and bitmaps into ManagerRestriction structs.
    /// @dev Only managers with non-zero bitmaps produce a restriction entry.
    function _bitmapsToRestrictions(
        address[] memory _managers,
        uint256[] memory _bitmaps
    ) private pure returns (ITyped.ManagerRestriction[] memory) {
        if (_managers.length != _bitmaps.length) {
            revert Errors.AuthRegistry_BitmapLengthMismatch(_managers.length, _bitmaps.length);
        }
        uint256 restrictedCount;
        for (uint256 i; i < _bitmaps.length; ++i) {
            if (_bitmaps[i] != 0) ++restrictedCount;
        }

        ITyped.ManagerRestriction[] memory restrictions = new ITyped.ManagerRestriction[](restrictedCount);
        uint256 idx;
        for (uint256 i; i < _bitmaps.length; ++i) {
            if (_bitmaps[i] == 0) continue;

            uint256 bitCount;
            uint256 temp = _bitmaps[i];
            while (temp != 0) {
                ++bitCount;
                temp &= temp - 1;
            }

            uint8[] memory actionTypes = new uint8[](bitCount);
            uint256 writeIdx;
            for (uint16 bit; bit < 256; ++bit) {
                if ((_bitmaps[i] >> bit) & 1 == 1) {
                    actionTypes[writeIdx++] = uint8(bit);
                    if (writeIdx == bitCount) break;
                }
            }

            restrictions[idx] = ITyped.ManagerRestriction({
                manager: _managers[i],
                allowedActionTypes: actionTypes
            });
            ++idx;
        }
        return restrictions;
    }

    // =============================
    // Internal: snapshot apply
    // =============================
    /// @notice Applies a complete auth config snapshot for a Safe.
    /// @dev Enforces invariants and either replaces the snapshot, no-ops on equality, or reverts.
    ///      Note: this function does NOT check whether manager/cosigner addresses are also Safe
    ///      owners. If a Safe owner is registered as a manager or cosigner, the EIP-712 module's
    ///      signer classification (isOwner > isCoSigner > isManager) will classify them as Owner,
    ///      silently reducing the effective manager/cosigner count. Bundle composers and SDK
    ///      tooling should prevent this overlap at construction time.
    /// @param _safe Safe whose auth config is being replaced.
    /// @param _newVersion Monotonic config version to apply.
    /// @param _newManagers Complete replacement manager set.
    /// @param _newCoSigners Complete replacement co-signer set.
    /// @param _managerCoSignThreshold Number of co-signers required for manager-signed bundles.
    /// @param _restrictions Per-manager action type restrictions.
    function _apply(
        address _safe,
        uint256 _newVersion,
        address[] memory _newManagers,
        address[] memory _newCoSigners,
        uint256 _managerCoSignThreshold,
        ITyped.ManagerRestriction[] memory _restrictions
    ) internal {
        _validateSnapshot(_newVersion, _newManagers, _newCoSigners, _managerCoSignThreshold);

        AuthConfig storage state = _state[_safe];
        uint256 currentVersion = state.version;

        if (_newVersion < currentVersion) {
            revert Errors.AuthRegistry_StaleVersion(_newVersion, currentVersion);
        }
        if (_newVersion == currentVersion) {
            if (!_configMatches(state, _safe, _newManagers, _newCoSigners, _managerCoSignThreshold, _restrictions)) {
                revert Errors.AuthRegistry_ConflictingConfig(_newVersion);
            }
            return;
        }

        uint256 oldLen = state.managers.length();
        for (uint256 i; i < oldLen; ++i) {
            _actionTypeBitmaps[_safe][state.managers.at(i)] = 0;
        }

        _replaceSet(state.managers, _newManagers, true);
        _replaceSet(state.coSigners, _newCoSigners, false);
        state.managerCoSignThreshold = _managerCoSignThreshold;
        state.version = _newVersion;

        _applyRestrictions(_safe, _newManagers, _restrictions);

        uint256[] memory bitmaps = new uint256[](_newManagers.length);
        for (uint256 i; i < _newManagers.length; ++i) {
            bitmaps[i] = _actionTypeBitmaps[_safe][_newManagers[i]];
        }
        LOGGER.logAdminVaultEvent(
            LOG_ID_AUTH_CONFIG_UPDATED,
            abi.encode(_safe, _newVersion, _newManagers, _newCoSigners, _managerCoSignThreshold, bitmaps)
        );
    }

    /// @notice Zeros bitmaps for the new manager set, then writes restriction bitmaps.
    /// @dev Old-manager bitmaps are already cleared in `_apply` before `_replaceSet`.
    /// @param _safe Safe whose restriction bitmaps are being replaced.
    /// @param _newManagers The complete new manager set.
    /// @param _restrictions New restrictions to apply.
    function _applyRestrictions(
        address _safe,
        address[] memory _newManagers,
        ITyped.ManagerRestriction[] memory _restrictions
    ) private {
        for (uint256 i; i < _newManagers.length; ++i) {
            _actionTypeBitmaps[_safe][_newManagers[i]] = 0;
        }

        for (uint256 i; i < _restrictions.length; ++i) {
            address manager = _restrictions[i].manager;
            for (uint256 d; d < i; ++d) {
                if (_restrictions[d].manager == manager) {
                    revert Errors.AuthRegistry_DuplicateRestriction(manager);
                }
            }
            bool found = false;
            for (uint256 j; j < _newManagers.length; ++j) {
                if (_newManagers[j] == manager) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                revert Errors.AuthRegistry_RestrictionForNonManager(manager);
            }
            if (_restrictions[i].allowedActionTypes.length == 0) {
                revert Errors.AuthRegistry_EmptyRestriction(manager);
            }

            uint256 bitmap = 0;
            for (uint256 k; k < _restrictions[i].allowedActionTypes.length; ++k) {
                bitmap |= (1 << _restrictions[i].allowedActionTypes[k]);
            }
            _actionTypeBitmaps[_safe][manager] = bitmap;
        }
    }

    /// @notice Validates the auth snapshot before it is compared with or written to storage.
    /// @dev Validates snapshot-level invariants that do not depend on existing registry state.
    /// @param _newVersion Monotonic config version to apply.
    /// @param _newManagers Complete replacement manager set.
    /// @param _newCoSigners Complete replacement co-signer set.
    /// @param _managerCoSignThreshold Number of co-signers required for manager-signed bundles.
    function _validateSnapshot(
        uint256 _newVersion,
        address[] memory _newManagers,
        address[] memory _newCoSigners,
        uint256 _managerCoSignThreshold
    ) private pure {
        if (_newVersion == 0) revert Errors.AuthRegistry_VersionZero();
        if (_newManagers.length > MAX_MANAGERS_PER_SAFE) {
            revert Errors.AuthRegistry_TooManyManagers(_newManagers.length, MAX_MANAGERS_PER_SAFE);
        }
        if (_newCoSigners.length > MAX_COSIGNERS_PER_SAFE) {
            revert Errors.AuthRegistry_TooManyCoSigners(_newCoSigners.length, MAX_COSIGNERS_PER_SAFE);
        }
        if (_managerCoSignThreshold > _newCoSigners.length) {
            revert Errors.AuthRegistry_InvalidThreshold(_managerCoSignThreshold, _newCoSigners.length);
        }

        _assertValidMembers(_newManagers, _newCoSigners);
    }

    /// @notice Validates manager and co-signer member addresses.
    /// @dev Validates member addresses and prevents a signer from occupying both manager roles.
    /// @param _newManagers Complete replacement manager set.
    /// @param _newCoSigners Complete replacement co-signer set.
    function _assertValidMembers(address[] memory _newManagers, address[] memory _newCoSigners) private pure {
        for (uint256 i; i < _newManagers.length; ++i) {
            if (_newManagers[i] == address(0)) revert Errors.AuthRegistry_ZeroAddress();
        }
        for (uint256 i; i < _newCoSigners.length; ++i) {
            if (_newCoSigners[i] == address(0)) revert Errors.AuthRegistry_ZeroAddress();
            for (uint256 j; j < _newManagers.length; ++j) {
                if (_newCoSigners[i] == _newManagers[j]) {
                    revert Errors.AuthRegistry_CoSignerIsManager(_newCoSigners[i]);
                }
            }
        }
    }

    /// @notice Replaces all members in an auth config set.
    /// @dev Atomically replaces the contents of an EnumerableSet.
    ///      Removal iterates in reverse because EnumerableSet.remove swaps the target with the
    ///      last element and pops. Reverse iteration avoids index shifts that would skip elements.
    /// @param set EnumerableSet being replaced.
    /// @param newMembers Complete replacement members for `set`.
    /// @param _isManagerSet True for managers, false for co-signers.
    function _replaceSet(
        EnumerableSet.AddressSet storage set,
        address[] memory newMembers,
        bool _isManagerSet
    ) private {
        uint256 currentLen = set.length();
        for (uint256 i = currentLen; i > 0; --i) {
            set.remove(set.at(i - 1));
        }
        for (uint256 i; i < newMembers.length; ++i) {
            if (!set.add(newMembers[i])) {
                if (_isManagerSet) {
                    revert Errors.AuthRegistry_DuplicateManager(newMembers[i]);
                } else {
                    revert Errors.AuthRegistry_DuplicateCoSigner(newMembers[i]);
                }
            }
        }
    }

    /// @notice Checks whether a candidate snapshot matches stored auth config state.
    /// @dev Full config equality check. Used for idempotent same-version applications.
    /// @param state Stored auth config for the Safe.
    /// @param _safe Safe address (needed for bitmap comparison).
    /// @param _managers Candidate manager set.
    /// @param _coSigners Candidate co-signer set.
    /// @param _managerThreshold Candidate manager co-sign threshold.
    /// @param _restrictions Candidate manager restrictions.
    /// @return True when every stored auth config field matches the candidate.
    function _configMatches(
        AuthConfig storage state,
        address _safe,
        address[] memory _managers,
        address[] memory _coSigners,
        uint256 _managerThreshold,
        ITyped.ManagerRestriction[] memory _restrictions
    ) internal view returns (bool) {
        if (state.managerCoSignThreshold != _managerThreshold) return false;
        if (!_setMatches(state.managers, _managers)) return false;
        if (!_setMatches(state.coSigners, _coSigners)) return false;
        if (!_restrictionsMatch(_safe, _managers, _restrictions)) return false;
        return true;
    }

    /// @notice Checks whether candidate restrictions match stored bitmaps.
    /// @param _safe Safe address for bitmap lookup.
    /// @param _managers Candidate manager set.
    /// @param _restrictions Candidate restrictions.
    /// @return True when bitmaps would be identical after applying the restrictions.
    function _restrictionsMatch(
        address _safe,
        address[] memory _managers,
        ITyped.ManagerRestriction[] memory _restrictions
    ) private view returns (bool) {
        for (uint256 i; i < _managers.length; ++i) {
            uint256 expectedBitmap = 0;
            for (uint256 j; j < _restrictions.length; ++j) {
                if (_restrictions[j].manager == _managers[i]) {
                    for (uint256 k; k < _restrictions[j].allowedActionTypes.length; ++k) {
                        expectedBitmap |= (1 << _restrictions[j].allowedActionTypes[k]);
                    }
                    break;
                }
            }
            if (_actionTypeBitmaps[_safe][_managers[i]] != expectedBitmap) return false;
        }
        return true;
    }

    /// @notice Checks whether a candidate member list matches a stored set.
    /// @dev Set equality with no order requirement. Rejects duplicates in `candidate`.
    /// @param set Stored set to compare.
    /// @param candidate Candidate members to compare against `set`.
    /// @return True when `candidate` contains each stored member exactly once.
    function _setMatches(EnumerableSet.AddressSet storage set, address[] memory candidate)
        internal
        view
        returns (bool)
    {
        if (set.length() != candidate.length) return false;
        for (uint256 i; i < candidate.length; ++i) {
            if (!set.contains(candidate[i])) return false;
            for (uint256 j; j < i; ++j) {
                if (candidate[j] == candidate[i]) return false;
            }
        }
        return true;
    }

    // =============================
    // Reads
    // =============================
    /// @notice Returns whether `_addr` is registered as a manager for `_safe`.
    /// @param _safe Safe whose manager set is checked.
    /// @param _addr Address to check.
    /// @return True when `_addr` is a registered manager for `_safe`.
    function isManager(address _safe, address _addr) external view returns (bool) {
        return _state[_safe].managers.contains(_addr);
    }

    /// @notice Returns whether `_addr` is registered as a co-signer for `_safe`.
    /// @param _safe Safe whose co-signer set is checked.
    /// @param _addr Address to check.
    /// @return True when `_addr` is a registered co-signer for `_safe`.
    function isCoSigner(address _safe, address _addr) external view returns (bool) {
        return _state[_safe].coSigners.contains(_addr);
    }

    /// @notice Returns all managers registered for `_safe`.
    /// @param _safe Safe whose manager set is returned.
    /// @return Managers registered for `_safe`.
    function getManagers(address _safe) external view returns (address[] memory) {
        return _state[_safe].managers.values();
    }

    /// @notice Returns all co-signers registered for `_safe`.
    /// @param _safe Safe whose co-signer set is returned.
    /// @return Co-signers registered for `_safe`.
    function getCoSigners(address _safe) external view returns (address[] memory) {
        return _state[_safe].coSigners.values();
    }

    /// @notice Returns the manager co-sign threshold for `_safe`.
    /// @param _safe Safe whose manager co-sign threshold is returned.
    /// @return Manager co-sign threshold for `_safe`.
    function getManagerCoSignThreshold(address _safe) external view returns (uint256) {
        return _state[_safe].managerCoSignThreshold;
    }

    /// @notice Returns the current auth config version for `_safe`.
    /// @param _safe Safe whose auth config version is returned.
    /// @return Current auth config version for `_safe`.
    function getVersion(address _safe) external view returns (uint256) {
        return _state[_safe].version;
    }

    /// @notice Returns whether a specific action type is allowed for a manager on a Safe.
    /// @dev A zero bitmap means the manager is unrestricted (all action types allowed).
    /// @param _safe Safe whose restrictions are checked.
    /// @param _manager Manager address to check.
    /// @param _actionType ActionType enum value to check.
    /// @return True when the action type is allowed (either unrestricted or bit is set).
    function isActionTypeAllowed(address _safe, address _manager, uint8 _actionType) external view returns (bool) {
        uint256 bitmap = _actionTypeBitmaps[_safe][_manager];
        if (bitmap == 0) return true;
        return ((bitmap >> _actionType) & 1) == 1;
    }

    /// @notice Returns the raw action type bitmap for a manager on a Safe.
    /// @dev Zero means unrestricted. Non-zero: only bit-set action types are allowed.
    /// @param _safe Safe whose bitmap is returned.
    /// @param _manager Manager address.
    /// @return The action type bitmap.
    function getManagerActionBitmap(address _safe, address _manager) external view returns (uint256) {
        return _actionTypeBitmaps[_safe][_manager];
    }
}
