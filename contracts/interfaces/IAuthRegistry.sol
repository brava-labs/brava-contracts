// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title IAuthRegistry
/// @notice Interface for AuthRegistry — the per-chain canonical store of authorised managers,
///         co-signers, and co-signing thresholds per Safe. Auth config is written exclusively via
///         Owner-signed EIP-712 `AuthBundle`s verified by the registry itself.
/// @notice State changes are logged via the shared Logger (logId 209). No events are declared on this interface.
interface IAuthRegistry {
    /// @notice Per-manager restriction: limits which ActionType values a manager may execute.
    /// @dev Only restricted managers need entries. A manager absent from managerRestrictions is unrestricted.
    struct ManagerRestriction {
        address manager;
        uint8[] allowedActionTypes;
    }

    /// @notice Complete auth config snapshot applied at a monotonically increasing version.
    /// @dev The Owner signs the full target auth config; the registry handles the atomic state
    ///      transition with version-monotonic semantics and idempotent equality. The snapshot is
    ///      chain-agnostic: the same signed payload is valid on every chain (and on chains added
    ///      later), enabling store-and-relay cross-chain propagation.
    struct AuthUpdate {
        uint256 newVersion;
        address[] newManagers;
        address[] newCoSigners;
        uint256 managerCoSignThreshold;
        ManagerRestriction[] managerRestrictions;
    }

    /// @notice Owner-signed EIP-712 payload carrying an auth config snapshot.
    /// @dev Signed against the chain-agnostic domain (chainId=1, verifyingContract=Safe), so one
    ///      signature authorises the snapshot on all chains. Expiry is typically far in the future;
    ///      replay protection comes from the registry's version monotonicity, not the expiry.
    struct AuthBundle {
        uint256 expiry;
        AuthUpdate authUpdate;
    }

    /// @notice Verifies an Owner-signed AuthBundle and snapshot-replaces the Safe's auth config.
    /// @dev Permissionless relayer entry: the signature, not the caller, carries the authority.
    function applyAuthBundle(
        address _safe,
        AuthBundle calldata _bundle,
        bytes calldata _signature
    ) external;

    function isManager(address _safe, address _addr) external view returns (bool);

    function isCoSigner(address _safe, address _addr) external view returns (bool);

    function getManagers(address _safe) external view returns (address[] memory);

    function getCoSigners(address _safe) external view returns (address[] memory);

    function getManagerCoSignThreshold(address _safe) external view returns (uint256);

    function getVersion(address _safe) external view returns (uint256);

    function isActionTypeAllowed(address _safe, address _manager, uint8 _actionType) external view returns (bool);

    function getManagerActionBitmap(address _safe, address _manager) external view returns (uint256);

    function getDomainSeparator(address _safeAddr) external view returns (bytes32);

    function getAuthBundleHash(address _safeAddr, AuthBundle calldata _bundle) external view returns (bytes32);

    // solhint-disable-next-line func-name-mixedcase
    function MAX_MANAGERS_PER_SAFE() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MAX_COSIGNERS_PER_SAFE() external view returns (uint256);
}
