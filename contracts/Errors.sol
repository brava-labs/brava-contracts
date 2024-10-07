// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

/// @title Errors
/// @notice This contract contains all custom errors used across the protocol
contract Errors {
    // Generic errors
    error InvalidAmount(string _reference, uint256 _providedAmount);
    error InvalidInput();

    // AccessControlDelayed errors
    error AccessControlDelayed_InvalidDelay();

    // AdminVault errors
    error AdminVault_FeePercentageOutOfRange(uint256 _providedPercentage, uint256 _minAllowed, uint256 _maxAllowed);
    error AdminVault_InvalidFeeRange(uint256 _minFee, uint256 _maxFee);
    error AdminVault_AlreadyInitialized();
    error AdminVault_NotInitialized();
    error AdminVault_Unauthorized(address _caller, bytes32 _requiredRole);
    error AdminVault_DelayNotPassed(uint256 _currentTime, uint256 _requiredTime);
    error AdminVault_NotFound(string _entityType, bytes4 _entityId);
    error AdminVault_NotProposed();
    error AdminVault_AlreadyProposed();
    error AdminVault_NotAdded();
    error AdminVault_AlreadyAdded();

    // Generic Action errors
    error Action_ZeroAmount(string _protocolName, uint8 _actionType);
    error Action_InsufficientSharesReceived(string _protocolName, uint8 _actionType, uint256 _sharesReceived, uint256 _minSharesReceived);
    error Action_MaxSharesBurnedExceeded(string _protocolName, uint8 _actionType, uint256 _sharesBurned, uint256 _maxAllowed);

    // // BuyCover errors
    // error BuyCover_InvalidAssetID(uint256 _assetId);

    // // YearnSupply errors
    // error YearnSupply_InsufficientSharesReceived(uint256 _sharesReceived, uint256 _minSharesReceived);

    // // YearnWithdraw errors
    // error YearnWithdraw_MaxSharesBurnedExceeded(uint256 _sharesBurned, uint256 _maxAllowed);

    // // Curve3PoolSwap errors
    // error Curve3PoolSwap_InvalidTokenIndices(int128 _fromToken, int128 _toToken);
    // error Curve3PoolSwap_CannotSwapSameToken(int128 _tokenIndex);

    // // SequenceExecutor errors
    // error SequenceExecutor_NoActionAddressGiven(bytes4 _actionId);
}
