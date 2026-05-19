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

    // Generic Action errors
    error Action_ZeroAmount(address _pool, string _protocolName, uint8 _actionType);
    error Action_InsufficientSharesReceived(
        address _pool,
        string _protocolName,
        uint8 _actionType,
        uint256 _sharesReceived,
        uint256 _minSharesReceived
    );
    error Action_MaxSharesBurnedExceeded(
        address _pool,
        string _protocolName,
        uint8 _actionType,
        uint256 _sharesBurned,
        uint256 _maxAllowed
    );
    
    error Action_UnderlyingReceivedLessThanExpected(
        address _pool,
        uint256 _underlyingReceived,
        uint256 _expected
    );
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
    error EIP712TypedDataSafeModule_SignerNotAuthorised(address signer);
    error EIP712TypedDataSafeModule_OnlyOwnerCanUpdateAuth(address lowestSigner);
    error EIP712TypedDataSafeModule_InsufficientCoSignatures(uint256 provided, uint256 required);
    error EIP712TypedDataSafeModule_DuplicateSigner(address signer);
    error EIP712TypedDataSafeModule_SignersNotSorted();
    error EIP712TypedDataSafeModule_InvalidSignaturesLength();
    error EIP712TypedDataSafeModule_MultipleManagers();
    error EIP712TypedDataSafeModule_LengthMismatch();
    error EIP712TypedDataSafeModule_SafeDeploymentFailed();
    error EIP712TypedDataSafeModule_SafeAddressMismatch(address provided, address predicted);
    error EIP712TypedDataSafeModule_ActionNotFound(bytes4 actionId);
    error EIP712TypedDataSafeModule_NoAuthorisingPrincipal();
    error EIP712TypedDataSafeModule_TooManySignatures(uint256 provided, uint256 max);
    // Manager action type restriction errors
    error EIP712TypedDataSafeModule_ActionTypeNotAllowedForManager(address manager, uint8 actionType);
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

    // AuthRegistry errors
    error AuthRegistry_NotEnabledModule(address safe, address caller);
    error AuthRegistry_StaleVersion(uint256 provided, uint256 current);
    error AuthRegistry_ConflictingConfig(uint256 version);
    error AuthRegistry_TooManyManagers(uint256 count, uint256 max);
    error AuthRegistry_TooManyCoSigners(uint256 count, uint256 max);
    error AuthRegistry_DuplicateManager(address manager);
    error AuthRegistry_DuplicateCoSigner(address coSigner);
    error AuthRegistry_ZeroAddress();
    error AuthRegistry_InvalidThreshold(uint256 threshold, uint256 maxSigners);
    error AuthRegistry_CoSignerIsManager(address addr);
    error AuthRegistry_RestrictionForNonManager(address manager);
    error AuthRegistry_EmptyRestriction(address manager);
    error AuthRegistry_BitmapLengthMismatch(uint256 managersLength, uint256 bitmapsLength);
    error AuthRegistry_DuplicateRestriction(address manager);
    error AuthRegistry_CCTPRelayFailed();
    error AuthRegistry_BadHookEnvelope();
    error AuthRegistry_UnknownHookVersion(uint8 version);
    error AuthRegistry_HookSafeMismatch(bytes32 burnSender, bytes32 mintRecipient, address hookSafe);
    error AuthRegistry_HookMessageTooShort();
    error AuthRegistry_SafeMintRecipientMismatch(address safe, bytes32 mintRecipient);
    error AuthRegistry_SafeOwnerMismatch(address safe, address ownerAddress, address predicted);
    error AuthRegistry_VersionZero();

    // CCTPBundleReceiver errors
    error CCTPReceiver_BadMessage();
    error CCTPReceiver_BadVersion(uint32 provided);
    error CCTPReceiver_RelayFailed();
    error CCTPReceiver_ShortHook();
    error CCTPReceiver_OutOfBounds();

    // CCTPBridgeSend errors
    error CCTPBridgeSend_InsufficientBalance(uint256 balance, uint256 amount);
    error CCTPBridgeSend_BalanceMismatch(uint256 beforeBalance, uint256 afterBalance, uint256 expectedDelta);

    // BravaModuleLookup errors
    error MultipleBravaModules(address first, address second);
    error NoBravaModuleEnabled(address safe);
}
