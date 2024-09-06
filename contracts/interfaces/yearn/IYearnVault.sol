// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IYearnVault {
    // Events
    event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(
        address indexed sender,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );
    event Transfer(address indexed sender, address indexed receiver, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event StrategyChanged(address indexed strategy, uint256 indexed change_type);
    event StrategyReported(
        address indexed strategy,
        uint256 gain,
        uint256 loss,
        uint256 current_debt,
        uint256 protocol_fees,
        uint256 total_fees,
        uint256 total_refunds
    );
    event DebtUpdated(address indexed strategy, uint256 current_debt, uint256 new_debt);
    event RoleSet(address indexed account, uint256 indexed role);
    event UpdateRoleManager(address indexed role_manager);
    event UpdateAccountant(address indexed accountant);
    event UpdateDepositLimitModule(address indexed deposit_limit_module);
    event UpdateWithdrawLimitModule(address indexed withdraw_limit_module);
    event UpdateDefaultQueue(address[] new_default_queue);
    event UpdateUseDefaultQueue(bool use_default_queue);
    event UpdatedMaxDebtForStrategy(address indexed sender, address indexed strategy, uint256 new_debt);
    event UpdateDepositLimit(uint256 deposit_limit);
    event UpdateMinimumTotalIdle(uint256 minimum_total_idle);
    event UpdateProfitMaxUnlockTime(uint256 profit_max_unlock_time);
    event DebtPurchased(address indexed strategy, uint256 amount);
    event Shutdown();

    // Functions
    function initialize(
        address asset,
        string memory name,
        string memory symbol,
        address role_manager,
        uint256 profit_max_unlock_time
    ) external;
    function set_accountant(address new_accountant) external;
    function set_default_queue(address[] memory new_default_queue) external;
    function set_use_default_queue(bool use_default_queue) external;
    function set_deposit_limit(uint256 deposit_limit) external;
    function set_deposit_limit(uint256 deposit_limit, bool _override) external;
    function set_deposit_limit_module(address deposit_limit_module) external;
    function set_deposit_limit_module(address deposit_limit_module, bool _override) external;
    function set_withdraw_limit_module(address withdraw_limit_module) external;
    function set_minimum_total_idle(uint256 minimum_total_idle) external;
    function setProfitMaxUnlockTime(uint256 new_profit_max_unlock_time) external;
    function set_role(address account, uint256 role) external;
    function add_role(address account, uint256 role) external;
    function remove_role(address account, uint256 role) external;
    function transfer_role_manager(address role_manager) external;
    function accept_role_manager() external;
    function isShutdown() external view returns (bool);
    function unlockedShares() external view returns (uint256);
    function pricePerShare() external view returns (uint256);
    function get_default_queue() external view returns (address[] memory);
    function process_report(address strategy) external returns (uint256, uint256);
    function buy_debt(address strategy, uint256 amount) external;
    function add_strategy(address new_strategy) external;
    function add_strategy(address new_strategy, bool add_to_queue) external;
    function revoke_strategy(address strategy) external;
    function force_revoke_strategy(address strategy) external;
    function update_max_debt_for_strategy(address strategy, uint256 new_max_debt) external;
    function update_debt(address strategy, uint256 target_debt) external returns (uint256);
    function update_debt(address strategy, uint256 target_debt, uint256 max_loss) external returns (uint256);
    function shutdown_vault() external;
    function deposit(uint256 assets, address receiver) external returns (uint256);
    function mint(uint256 shares, address receiver) external returns (uint256);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256);
    function withdraw(uint256 assets, address receiver, address owner, uint256 max_loss) external returns (uint256);
    function withdraw(
        uint256 assets,
        address receiver,
        address owner,
        uint256 max_loss,
        address[] memory strategies
    ) external returns (uint256);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256);
    function redeem(uint256 shares, address receiver, address owner, uint256 max_loss) external returns (uint256);
    function redeem(
        uint256 shares,
        address receiver,
        address owner,
        uint256 max_loss,
        address[] memory strategies
    ) external returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address receiver, uint256 amount) external returns (bool);
    function transferFrom(address sender, address receiver, uint256 amount) external returns (bool);
    function permit(
        address owner,
        address spender,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool);
    function balanceOf(address addr) external view returns (uint256);
    function totalSupply() external view returns (uint256);
    function totalAssets() external view returns (uint256);
    function totalIdle() external view returns (uint256);
    function totalDebt() external view returns (uint256);
    function convertToShares(uint256 assets) external view returns (uint256);
    function previewDeposit(uint256 assets) external view returns (uint256);
    function previewMint(uint256 shares) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
    function maxDeposit(address receiver) external view returns (uint256);
    function maxMint(address receiver) external view returns (uint256);
    function maxWithdraw(address owner) external view returns (uint256);
    function maxWithdraw(address owner, uint256 max_loss) external view returns (uint256);
    function maxWithdraw(address owner, uint256 max_loss, address[] memory strategies) external view returns (uint256);
    function maxRedeem(address owner) external view returns (uint256);
    function maxRedeem(address owner, uint256 max_loss) external view returns (uint256);
    function maxRedeem(address owner, uint256 max_loss, address[] memory strategies) external view returns (uint256);
    function previewWithdraw(uint256 assets) external view returns (uint256);
    function previewRedeem(uint256 shares) external view returns (uint256);
    function FACTORY() external view returns (address);
    function apiVersion() external view returns (string memory);
    function assess_share_of_unrealised_losses(address strategy, uint256 assets_needed) external view returns (uint256);
    function profitMaxUnlockTime() external view returns (uint256);
    function fullProfitUnlockDate() external view returns (uint256);
    function profitUnlockingRate() external view returns (uint256);
    function lastProfitUpdate() external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function asset() external view returns (address);
    function decimals() external view returns (uint8);
    function strategies(
        address
    ) external view returns (uint256 activation, uint256 last_report, uint256 current_debt, uint256 max_debt);
    function default_queue(uint256) external view returns (address);
    function use_default_queue() external view returns (bool);
    function allowance(address, address) external view returns (uint256);
    function minimum_total_idle() external view returns (uint256);
    function deposit_limit() external view returns (uint256);
    function accountant() external view returns (address);
    function deposit_limit_module() external view returns (address);
    function withdraw_limit_module() external view returns (address);
    function roles(address) external view returns (uint256);
    function role_manager() external view returns (address);
    function future_role_manager() external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function nonces(address) external view returns (uint256);
}
