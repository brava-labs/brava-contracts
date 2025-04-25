// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IEulerV2Lending - Interface for Euler V2 lending operations
/// @notice Interface for interacting with Euler V2 lending protocol
interface IEulerV2Lending {
    /// @notice Struct for integration addresses
    struct Integrations {
        address evc;
        address protocolConfig;
        address sequenceRegistry;
        address balanceTracker;
        address permit2;
    }

    /// @notice Struct for deployed module addresses
    struct DeployedModules {
        address initialize;
        address token;
        address vault;
        address borrowing;
        address liquidation;
        address riskManager;
        address balanceForwarder;
        address governance;
    }

    /// @notice Various error states
    error E_AccountLiquidity();
    error E_AmountTooLargeToEncode();
    error E_BadAddress();
    error E_BadAssetReceiver();
    error E_BadBorrowCap();
    error E_BadCollateral();
    error E_BadFee();
    error E_BadMaxLiquidationDiscount();
    error E_BadSharesOwner();
    error E_BadSharesReceiver();
    error E_BadSupplyCap();
    error E_BorrowCapExceeded();
    error E_CheckUnauthorized();
    error E_CollateralDisabled();
    error E_ConfigAmountTooLargeToEncode();
    error E_ControllerDisabled();
    error E_DebtAmountTooLargeToEncode();
    error E_EmptyError();
    error E_ExcessiveRepayAmount();
    error E_FlashLoanNotRepaid();
    error E_Initialized();
    error E_InsufficientAllowance();
    error E_InsufficientAssets();
    error E_InsufficientBalance();
    error E_InsufficientCash();
    error E_InsufficientDebt();
    error E_InvalidLTVAsset();
    error E_LTVBorrow();
    error E_LTVLiquidation();
    error E_LiquidationCoolOff();
    error E_MinYield();
    error E_NoLiability();
    error E_NoPriceOracle();
    error E_NotController();
    error E_NotHookTarget();
    error E_NotSupported();
    error E_OperationDisabled();
    error E_OutstandingDebt();
    error E_ProxyMetadata();
    error E_Reentrancy();
    error E_RepayTooMuch();
    error E_SelfLiquidation();
    error E_SelfTransfer();
    error E_SupplyCapExceeded();
    error E_TransientState();
    error E_Unauthorized();
    error E_ViolatorLiquidityDeferred();
    error E_ZeroAssets();
    error E_ZeroShares();

    /// @notice Core lending functions
    function deposit(uint256 amount, address receiver) external returns (uint256);
    function withdraw(uint256 amount, address receiver, address owner) external returns (uint256);
    function borrow(uint256 amount, address receiver) external returns (uint256);
    function repay(uint256 amount, address receiver) external returns (uint256);
    
    /// @notice View functions for balances and limits
    function balanceOf(address account) external view returns (uint256);
    function debtOf(address account) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function maxBorrow(address account) external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function totalBorrows() external view returns (uint256);
    
    /// @notice Liquidation related functions
    function liquidate(
        address violator,
        address collateral,
        uint256 repayAssets,
        uint256 minYieldBalance
    ) external;
    
    function checkLiquidation(
        address liquidator,
        address violator,
        address collateral
    ) external view returns (uint256 maxRepay, uint256 maxYield);

    /// @notice Account status and liquidity checks
    function accountLiquidity(address account, bool liquidation)
        external
        view
        returns (uint256 collateralValue, uint256 liabilityValue);

    function checkAccountStatus(address account, address[] calldata collaterals)
        external
        view
        returns (bytes4);

    /// @notice Asset conversion functions
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    
    /// @notice Basic token info
    function asset() external view returns (address);
    function decimals() external view returns (uint8);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);

    /// @notice Events
    event Deposit(
        address indexed sender,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    
    event Borrow(address indexed account, uint256 assets);
    event Repay(address indexed account, uint256 assets);
    
    event Liquidate(
        address indexed liquidator,
        address indexed violator,
        address collateral,
        uint256 repayAssets,
        uint256 yieldBalance
    );
} 