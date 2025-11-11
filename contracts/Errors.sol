// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

/// @title Errors
/// @notice This contract contains all custom errors used across the protocol
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract Errors {
    // Generic errors
    error InvalidInput(string _contract, string _function);

    // AccessControlDelayed errors
    error AccessControlDelayed_InvalidDelay();
    error AccessControlDelayed_MustHaveAdminRole(address account, bytes32 role);
    error AccessControlDelayed_CannotGrantOwnerRole();
    error AccessControlDelayed_MustHaveRoleManagerOrOwner(address account);

    // AdminVault errors
    error AdminVault_InvalidInput();
    error AdminVault_FeePercentageOutOfRange(uint256 _providedPercentage, uint256 _minAllowed, uint256 _maxAllowed);
    error AdminVault_InvalidFeeRange(uint256 _minFee, uint256 _maxFee);
    error AdminVault_DelayNotPassed(uint256 _currentTime, uint256 _requiredTime);
    error AdminVault_PoolNotFound(bytes4 _poolId);
    error AdminVault_ActionNotFound(bytes4 _actionId);
    error AdminVault_ConfigNotFound(bytes4 _configId);
    error AdminVault_NotProposed();
    error AdminVault_AlreadyProposed();
    error AdminVault_AlreadyAdded();
    error AdminVault_NotPool(address _pool);
    error AdminVault_AlreadyGranted();
    error AdminVault_NotGranted();
    error AdminVault_TransactionNotProposed();
    error AdminVault_TransactionAlreadyApproved();
    error AdminVault_MissingRole(bytes32 role, address account);

    // FeeTakeSafeModule errors
    error FeeTakeSafeModule_SenderNotFeeTaker(address _sender);
    error FeeTakeSafeModule_InvalidActionType(bytes4 _actionId);
    error FeeTakeSafeModule_ExecutionFailed();
    error FeeTakeSafeModule_LengthMismatch();

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
    
    error Action_UnderlyingReceivedLessThanExpected(uint256 _underlyingReceived, uint256 _expected);
    error Action_FeesNotPaid(string _protocolName, uint8 _actionType, address _token);

    // CompoundV2Supply errors
    error Action_CompoundError(string _protocolName, uint8 _actionType, uint256 _errorCode);

    // Curve3PoolSwap errors
    error Curve3Pool__InvalidTokenIndices(int128 _fromToken, int128 _toToken);

    // ParaswapSwap errors
    error Paraswap__SwapFailed();
    error Paraswap__InsufficientOutput(uint256 _amountReceived, uint256 _minToAmount);
    error Paraswap__TokenNotApproved(address token);
    error Paraswap__TokenMismatch(address expected, address actual);
    error Paraswap__InvalidCalldata();
    error Paraswap__UnsupportedSelector(bytes4 selector);

    // 0x errors
    error ZeroEx__SwapFailed();
    error ZeroEx__InsufficientOutput(uint256 _amountReceived, uint256 _minToAmount);
    error ZeroEx__InvalidSwapTarget(address provided, address expected);
    error ZeroEx__TokenNotApproved(address token);

    // SendToken errors
    error Action_InvalidRecipient(string _protocolName, uint8 _actionType);

    // UpgradeAction errors

    // EIP712TypedDataSafeModule errors
    error EIP712TypedDataSafeModule_InvalidSignature();
    error EIP712TypedDataSafeModule_BundleExpired();
    error EIP712TypedDataSafeModule_ChainSequenceNotFound(uint256 chainId, uint256 expectedNonce);
    error EIP712TypedDataSafeModule_ActionMismatch(uint256 actionIndex, string expectedProtocol, uint8 expectedType, string actualProtocol, uint8 actualType);
    error EIP712TypedDataSafeModule_ExecutionFailed();
    error EIP712TypedDataSafeModule_SignerNotOwner(address signer);
    error EIP712TypedDataSafeModule_LengthMismatch();
    error EIP712TypedDataSafeModule_SafeDeploymentFailed();
    error EIP712TypedDataSafeModule_SafeAddressMismatch(address provided, address predicted);
    error EIP712TypedDataSafeModule_ActionNotFound(bytes4 actionId);
    // Gas refund errors
    error EIP712TypedDataSafeModule_InvalidRefundRecipient(uint8 refundTo);
    error EIP712TypedDataSafeModule_RefundActionRequired();
    error EIP712TypedDataSafeModule_RefundActionNotAllowed();

    // SafeDeployment errors
    error SafeDeployment_SafeAlreadyDeployed();
    error SafeDeployment_SafeDeploymentFailed();
    error SafeDeployment_SafeInitializationFailed();

    // TokenRegistry errors
    error TokenRegistry_TokenNotApproved();

    // CCTPBundleReceiver errors
    error CCTPReceiver_BadMessage();
    error CCTPReceiver_BadVersion(uint32 provided);
    error CCTPReceiver_RelayFailed();
    error CCTPReceiver_ShortHook();
    error CCTPReceiver_OutOfBounds();

    // CCTPBridgeSend errors
    error CCTPBridgeSend_InsufficientBalance(uint256 balance, uint256 amount);
    error CCTPBridgeSend_DepositFailed();
    error CCTPBridgeSend_BalanceMismatch(uint256 beforeBalance, uint256 afterBalance, uint256 expectedDelta);
    error CCTPBridgeSend_BundleContextRequired();
}
