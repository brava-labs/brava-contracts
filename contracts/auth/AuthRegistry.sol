// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {Errors} from "../Errors.sol";
import {IAuthRegistry} from "../interfaces/IAuthRegistry.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {IOwnerManager} from "../interfaces/safe/IOwnerManager.sol";
import {ISafeDeployment} from "../interfaces/ISafeDeployment.sol";
import {EIP712TypedDataLib} from "../libraries/EIP712TypedDataLib.sol";

/// @title AuthRegistry
/// @author Brava Finance
/// @notice Per-chain registry of authorised managers, co-signers, and co-signing thresholds per Safe,
///         plus a monotonic version counter. Canonical state consulted by the EIP-712 module's signer gate.
/// @dev The single write path is `applyAuthBundle`: a permissionless relayer entry that verifies an
///      Owner-signed EIP-712 `AuthBundle` against the chain-agnostic domain (chainId=1,
///      verifyingContract=Safe) and snapshot-replaces the config via `_apply` (length cap,
///      zero/duplicate checks, version-monotonic with idempotent equality, threshold validation).
///      Because the domain binds to the Safe — not to this registry or the module — the same signed
///      payload is relayable on every chain, including chains added after signing, and survives
///      module or registry redeployment.
/// @dev When the Safe is not yet deployed on this chain, ownership is proven by matching the
///      signer's deterministic CREATE2 Safe address (`predictSafeAddress`). This allows auth config
///      to land before the Safe lazily deploys during its first bundle execution.
/// @notice Auth-config state changes are logged via the shared Logger (logId 209).
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract AuthRegistry {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Hard cap on the number of managers per Safe.
    uint256 public constant MAX_MANAGERS_PER_SAFE = 10;

    /// @notice Hard cap on the number of co-signers per Safe.
    uint256 public constant MAX_COSIGNERS_PER_SAFE = 10;

    /// @notice Largest forward gap allowed between the current and the applied auth version. Versions
    ///         may skip ahead (a chain that missed an intermediate version need not replay it) but not
    ///         by more than this, which bounds how fast the version space can be consumed: exhausting
    ///         it would take on the order of `type(uint256).max / MAX_VERSION_INCREASE` applications.
    uint256 public constant MAX_VERSION_INCREASE = 10;

    /// @notice AdminVaultEvent logId emitted on every state mutation.
    uint256 private constant LOG_ID_AUTH_CONFIG_UPDATED = 209;

    /// @notice Length of a single packed ECDSA signature (r[32] || s[32] || v[1]).
    uint256 private constant SIGNATURE_LENGTH = 65;

    /// @notice Logger contract receiving all auth config update events.
    ILogger public immutable LOGGER;

    /// @notice Safe factory used to prove ownership of not-yet-deployed Safes via CREATE2 prediction.
    ISafeDeployment public immutable SAFE_DEPLOYMENT;

    /// @notice EIP-712 domain name used in the domain separator.
    string public domainName;
    /// @notice EIP-712 domain version used in the domain separator.
    string public domainVersion;

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

    /// @notice Initializes the registry with its logger, Safe deployment helper, and EIP-712 domain.
    /// @param _logger Logger contract receiving auth config update events.
    /// @param _safeDeployment Safe deployment helper used for CREATE2 owner verification.
    /// @param _domainName EIP-712 domain name (must match the bundle-executing module's domain).
    /// @param _domainVersion EIP-712 domain version (must match the bundle-executing module's domain).
    constructor(
        address _logger,
        address _safeDeployment,
        string memory _domainName,
        string memory _domainVersion
    ) {
        require(
            _logger != address(0) &&
                _safeDeployment != address(0) &&
                bytes(_domainName).length > 0 &&
                bytes(_domainVersion).length > 0,
            "Invalid input"
        );
        LOGGER = ILogger(_logger);
        SAFE_DEPLOYMENT = ISafeDeployment(_safeDeployment);
        domainName = _domainName;
        domainVersion = _domainVersion;
    }

    // =============================
    // Write path — Owner-signed AuthBundle
    // =============================
    /// @notice Verifies an Owner-signed EIP-712 AuthBundle and snapshot-replaces the Safe's auth
    ///         config at the carried version. Permissionless: the signature, not the caller,
    ///         carries the authority, so any relayer can submit a stored bundle on any chain.
    /// @dev Replay semantics are intentional and version-bound: the same signature applies the same
    ///      snapshot on every chain (idempotent at equal version) and becomes inert everywhere once
    ///      a higher version exists (`_apply` reverts stale versions). Ownership is checked against
    ///      the live Safe owner list, so a signature from a removed owner stops verifying.
    /// @param _safe Safe whose auth config is being replaced.
    /// @param _bundle Owner-signed auth bundle (expiry + full config snapshot).
    /// @param _signature Single packed 65-byte ECDSA signature (r[32] || s[32] || v[1]) by a Safe owner.
    function applyAuthBundle(
        address _safe,
        IAuthRegistry.AuthBundle calldata _bundle,
        bytes calldata _signature
    ) external {
        if (_bundle.expiry < block.timestamp + 1) {
            revert Errors.AuthRegistry_BundleExpired();
        }
        if (_signature.length != SIGNATURE_LENGTH) {
            revert Errors.AuthRegistry_InvalidSignatureLength(_signature.length);
        }

        bytes32 digest = EIP712TypedDataLib.hashAuthBundleForSigning(domainName, domainVersion, _safe, _bundle);
        address signer = ECDSA.recover(digest, _signature);

        _assertSignerIsOwner(_safe, signer);

        _apply(
            _safe,
            _bundle.authUpdate.newVersion,
            _bundle.authUpdate.newManagers,
            _bundle.authUpdate.newCoSigners,
            _bundle.authUpdate.managerCoSignThreshold,
            _bundle.authUpdate.managerRestrictions
        );
    }

    /// @notice Requires the recovered signer to be an owner of the Safe.
    /// @dev For a deployed Safe the live owner list is authoritative. For a not-yet-deployed Safe,
    ///      ownership is proven by the signer's deterministic CREATE2 Safe address matching `_safe`
    ///      — the same derivation the deployment factory uses, so no other EOA can produce it.
    /// @param _safe Safe whose ownership is being checked.
    /// @param _signer Recovered AuthBundle signer.
    function _assertSignerIsOwner(address _safe, address _signer) private view {
        if (_safe.code.length > 0) {
            if (!IOwnerManager(_safe).isOwner(_signer)) {
                revert Errors.AuthRegistry_SignerNotOwner(_safe, _signer);
            }
            return;
        }
        if (SAFE_DEPLOYMENT.predictSafeAddress(_signer) != _safe) {
            revert Errors.AuthRegistry_SignerNotOwner(_safe, _signer);
        }
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
        IAuthRegistry.ManagerRestriction[] memory _restrictions
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
        // _newVersion > currentVersion here, so the subtraction cannot underflow. Bounding the forward
        // jump stops a single update from leaping to a near-`type(uint256).max` version that would
        // leave no reachable higher version and freeze the auth config; gaps within the cap stay legal.
        if (_newVersion - currentVersion > MAX_VERSION_INCREASE) {
            revert Errors.AuthRegistry_VersionJumpTooLarge(currentVersion, _newVersion, MAX_VERSION_INCREASE);
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
        IAuthRegistry.ManagerRestriction[] memory _restrictions
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
    /// @dev A threshold of 0 with co-signers present is intentionally permitted: it registers a
    ///      "dormant" co-signer set that does not yet gate manager bundles. This lets a new co-signer
    ///      be onboarded (added to the Safe's config so their detection and signing can be exercised
    ///      in simulation) without their signature becoming mandatory for live execution — so staged
    ///      onboarding never blocks managers/testers. The threshold is raised in a later auth update
    ///      once the co-signer is verified. Only an over-large threshold (more than the co-signer
    ///      count) is rejected, since that would be permanently unsatisfiable.
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
        IAuthRegistry.ManagerRestriction[] memory _restrictions
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
        IAuthRegistry.ManagerRestriction[] memory _restrictions
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

    /// @notice Computes the EIP-712 domain separator for a given Safe.
    /// @param _safeAddr The Safe address used as the verifyingContract
    /// @return The domain separator hash
    function getDomainSeparator(address _safeAddr) external view returns (bytes32) {
        return EIP712TypedDataLib.domainSeparator(domainName, domainVersion, _safeAddr);
    }

    /// @notice Computes the full EIP-712 signing hash for an auth bundle (domain separator + struct hash).
    /// @param _safeAddr The Safe address used as verifyingContract in the domain
    /// @param _bundle The auth bundle to hash
    /// @return The digest that the Safe owner must sign
    function getAuthBundleHash(
        address _safeAddr,
        IAuthRegistry.AuthBundle calldata _bundle
    ) external view returns (bytes32) {
        return EIP712TypedDataLib.hashAuthBundleForSigning(domainName, domainVersion, _safeAddr, _bundle);
    }
}
