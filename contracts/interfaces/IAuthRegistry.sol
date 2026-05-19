// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IEip712TypedDataSafeModule as ITyped} from "./IEip712TypedDataSafeModule.sol";

/// @title IAuthRegistry
/// @notice Interface for AuthRegistry — the per-chain canonical store of authorised managers,
///         co-signers, and co-signing thresholds per Safe.
/// @notice State changes are logged via the shared Logger (logId 209). No events are declared on this interface.
interface IAuthRegistry {
    /// @notice Snapshot-replace the full auth config for a Safe at a new version.
    /// @dev Module-only: reverts unless `msg.sender` is currently enabled as a module on `_safe`.
    function setAuthConfig(
        address _safe,
        uint256 _newVersion,
        address[] calldata _newManagers,
        address[] calldata _newCoSigners,
        uint256 _managerCoSignThreshold,
        ITyped.ManagerRestriction[] calldata _managerRestrictions
    ) external;

    /// @notice Permissionless CCTP relay: copies an auth config snapshot from a source-chain Safe.
    function receiveCCTPAuthUpdate(
        bytes calldata _message,
        bytes calldata _attestation
    ) external;

    /// @notice Permissionless combined CCTP relay: mints USDC, optionally applies an attested
    ///         auth config snapshot from `hookData`, and best-effort executes a bundle through the
    ///         destination Safe's currently-enabled Brava module (discovered via ERC-165).
    /// @dev Bundle failure does NOT revert — funds remain in the Safe and the bundle can be retried.
    ///      Mint failure DOES revert.
    ///      IMPORTANT: auth state from hookData is committed regardless of `bundleSuccess`. If a
    ///      bundle reverts inside the module, the auth update still holds. Callers and indexers
    ///      should treat `authApplied` and `bundleSuccess` as independent outcomes.
    /// @return authApplied True if hookData contained a valid auth snapshot that was applied.
    /// @return bundleSuccess True if the module's executeBundle call succeeded.
    /// @return bundleReturnData Module return data on success, or revert data on failure.
    ///         Empty when no module was found (distinguish via event logs or bundleSuccess=false
    ///         with zero-length returnData).
    function relayCCTPAndExecute(
        bytes calldata _message,
        bytes calldata _attestation,
        address _safe,
        address _ownerAddress,
        ITyped.Bundle calldata _bundle,
        bytes calldata _signatures
    ) external returns (bool authApplied, bool bundleSuccess, bytes memory bundleReturnData);

    function isManager(address _safe, address _addr) external view returns (bool);

    function isCoSigner(address _safe, address _addr) external view returns (bool);

    function getManagers(address _safe) external view returns (address[] memory);

    function getCoSigners(address _safe) external view returns (address[] memory);

    function getManagerCoSignThreshold(address _safe) external view returns (uint256);

    function getVersion(address _safe) external view returns (uint256);

    function isActionTypeAllowed(address _safe, address _manager, uint8 _actionType) external view returns (bool);

    function getManagerActionBitmap(address _safe, address _manager) external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MAX_MANAGERS_PER_SAFE() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MAX_COSIGNERS_PER_SAFE() external view returns (uint256);

    // solhint-disable-next-line func-name-mixedcase
    function MESSAGE_TRANSMITTER() external view returns (address);
}
