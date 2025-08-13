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
    error AdminVault_TransactionNotProposed();
    error AdminVault_TransactionAlreadyApproved();
    error AdminVault_TransactionNotApproved(bytes32 txHash);
    error AdminVault_MissingRole(bytes32 role, address account);

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
    error UpgradeAction_ConfigurationMismatch();
    error UpgradeAction_ModuleOperationFailed();

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
    error EIP712TypedDataSafeModule_UnauthorizedRefundCall();
    // Gas refund errors
    error EIP712TypedDataSafeModule_InvalidRefundToken(address token);
    error EIP712TypedDataSafeModule_RefundTokenNotApproved(address token);
    error EIP712TypedDataSafeModule_InvalidOraclePrice(int256 price);
    error EIP712TypedDataSafeModule_StaleOraclePrice(uint256 lastUpdated, uint256 currentTime);
    error EIP712TypedDataSafeModule_InvalidOracleRound(uint80 roundId, uint80 answeredInRound);
    error EIP712TypedDataSafeModule_InvalidRefundRecipient(uint8 refundTo);
    error EIP712TypedDataSafeModule_RefundTransferFailed();

    // SafeDeployment errors
    error SafeDeployment_SafeAlreadyDeployed();
    error SafeDeployment_SafeDeploymentFailed();
    error SafeDeployment_SafeInitializationFailed();

    // TokenRegistry errors
    error TokenRegistry_TokenNotApproved();
}
