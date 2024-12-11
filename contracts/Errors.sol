// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/// @title Errors
/// @notice This contract contains all custom errors used across the protocol
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract Errors {
    // Generic errors
    error InvalidInput(string _contract, string _function);

    // AccessControlDelayed errors
    error AccessControlDelayed_InvalidDelay();
    error AccessControlDelayed_MustHaveAdminRole(address account, bytes32 role);
    error AccessControlDelayed_CannotGrantOwnerRole();
    error AccessControlDelayed_MustHaveRoleManagerOrOwner(address account);

    // AdminVault errors
    error AdminVault_FeePercentageOutOfRange(uint256 _providedPercentage, uint256 _minAllowed, uint256 _maxAllowed);
    error AdminVault_InvalidFeeRange(uint256 _minFee, uint256 _maxFee);
    error AdminVault_NotInitialized();
    error AdminVault_DelayNotPassed(uint256 _currentTime, uint256 _requiredTime);
    error AdminVault_NotFound(string _entityType, bytes4 _entityId);
    error AdminVault_NotProposed();
    error AdminVault_AlreadyProposed();
    error AdminVault_NotAdded();
    error AdminVault_AlreadyAdded();
    error AdminVault_NotPool(address _pool);
    error AdminVault_AlreadyGranted();
    error AdminVault_NotGranted();

    // FeeTakeSafeModule errors
    error FeeTakeSafeModule_SenderNotFeeTaker(address _sender);
    error FeeTakeSafeModule_InvalidActionType(bytes4 _actionId);
    error FeeTakeSafeModule_ExecutionFailed();

    // Generic Action errors
    error Action_ZeroAmount(string _protocolName, uint8 _actionType);
    error Action_InsufficientSharesReceived(
        string _protocolName,
        uint8 _actionType,
        uint256 _sharesReceived,
        uint256 _minSharesReceived
    );
    error Action_MaxSharesBurnedExceeded(
        string _protocolName,
        uint8 _actionType,
        uint256 _sharesBurned,
        uint256 _maxAllowed
    );
    error Action_InvalidPool(string _protocolName, uint8 _actionType);

    // CompoundV2Supply errors
    error Action_CompoundError(string _protocolName, uint8 _actionType, uint256 _errorCode);

    // Curve3PoolSwap errors
    error Curve3Pool__InvalidTokenIndices(int128 _fromToken, int128 _toToken);

    // ParaswapSwap errors
    error Paraswap__SwapFailed();
    error Paraswap__InsufficientOutput(uint256 _amountReceived, uint256 _minToAmount);

    // SendToken errors
    error Action_InvalidRecipient(string _protocolName, uint8 _actionType);
}
