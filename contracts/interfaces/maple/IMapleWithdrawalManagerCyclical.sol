// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/**
 * @title IMapleWithdrawalManagerCyclical
 * @dev Interface for Maple Finance Cyclical Withdrawal Manager contracts
 * @notice This is for the cyclical withdrawal manager, which uses cycles and windows for withdrawals
 */
interface IMapleWithdrawalManagerCyclical {
    /**
     * @notice Cycle configuration structure
     */
    struct CycleConfig {
        uint64 initialCycleId;
        uint64 initialCycleTime;
        uint64 cycleDuration;
        uint64 windowDuration;
    }

    /**
     * @notice Event emitted when a withdrawal is processed
     */
    event WithdrawalProcessed(
        address indexed account_,
        uint256 sharesToRedeem_,
        uint256 assetsToWithdraw_
    );

    /**
     * @notice Event emitted when a withdrawal is updated
     */
    event WithdrawalUpdated(
        address indexed account_,
        uint256 lockedShares_,
        uint64 windowStart_,
        uint64 windowEnd_
    );

    /**
     * @notice Event emitted when a withdrawal is cancelled
     */
    event WithdrawalCancelled(address indexed account_);

    /**
     * @notice Event emitted when cycle configuration is updated
     */
    event ConfigurationUpdated(
        uint256 indexed configId_,
        uint64 initialCycleId_,
        uint64 initialCycleTime_,
        uint64 cycleDuration_,
        uint64 windowDuration_
    );

    /**
     * @notice Get the asset address for this withdrawal manager
     * @return asset_ The address of the underlying asset
     */
    function asset() external view returns (address asset_);

    /**
     * @notice Add shares to a user's locked position
     * @param shares_ Amount of shares to add
     * @param owner_ The owner of the shares
     */
    function addShares(uint256 shares_, address owner_) external;

    /**
     * @notice Get the pool address this withdrawal manager belongs to
     * @return The pool address
     */
    function pool() external view returns (address);

    /**
     * @notice Get the amount of shares locked for withdrawal for a specific owner
     * @param owner_ The owner address
     * @return The amount of shares locked for withdrawal
     */
    function lockedShares(address owner_) external view returns (uint256);

    /**
     * @notice Check if the owner is currently in an exit window
     * @param owner_ The owner address
     * @return isInExitWindow_ True if the owner is in an exit window
     */
    function isInExitWindow(address owner_) external view returns (bool isInExitWindow_);

    /**
     * @notice Get the total liquidity currently locked in the withdrawal manager
     * @return lockedLiquidity_ Amount of liquidity locked
     */
    function lockedLiquidity() external view returns (uint256 lockedLiquidity_);

    /**
     * @notice Get the exit cycle ID for a given owner
     * @param owner_ The owner address
     * @return The cycle ID when the owner can exit
     */
    function exitCycleId(address owner_) external view returns (uint256);

    /**
     * @notice Get the current cycle ID
     * @return cycleId_ The current cycle ID
     */
    function getCurrentCycleId() external view returns (uint256 cycleId_);

    /**
     * @notice Remove shares from a withdrawal request
     * @param shares_ Amount of shares to remove
     * @param owner_ Owner of the shares
     * @return sharesReturned_ Amount of shares returned
     */
    function removeShares(uint256 shares_, address owner_) external returns (uint256 sharesReturned_);

    /**
     * @notice Process an exit request
     * @param requestedShares_ Amount of shares requested to redeem
     * @param owner_ Owner of the shares
     * @return redeemableShares_ Amount of shares redeemed
     * @return resultingAssets_ Amount of assets received
     */
    function processExit(uint256 requestedShares_, address owner_) external returns (uint256 redeemableShares_, uint256 resultingAssets_);

    /**
     * @notice Preview redeem operation
     * @param owner_ Owner of the shares
     * @param shares_ Amount of shares to redeem
     * @return redeemableShares_ Amount of shares that can be redeemed
     * @return resultingAssets_ Amount of assets that would be received
     */
    function previewRedeem(address owner_, uint256 shares_) external view returns (uint256 redeemableShares_, uint256 resultingAssets_);

    /**
     * @notice Get redeemable amounts for locked shares
     * @param lockedShares_ Amount of locked shares
     * @param owner_ Owner of the shares
     * @return redeemableShares_ Amount of shares that can be redeemed
     * @return resultingAssets_ Amount of assets that would be received
     * @return partialLiquidity_ Whether there's partial liquidity available
     */
    function getRedeemableAmounts(uint256 lockedShares_, address owner_) external view returns (
        uint256 redeemableShares_,
        uint256 resultingAssets_,
        bool partialLiquidity_
    );

    /**
     * @notice Get the current withdrawal configuration
     * @return config_ The current cycle configuration
     */
    function getCurrentConfig() external view returns (CycleConfig memory config_);

    /**
     * @notice Get the window timing for a specific cycle ID
     * @param cycleId_ The cycle ID to check
     * @return windowStart_ Start timestamp of the window
     * @return windowEnd_ End timestamp of the window
     */
    function getWindowAtId(uint256 cycleId_) external view returns (uint256 windowStart_, uint256 windowEnd_);
} 