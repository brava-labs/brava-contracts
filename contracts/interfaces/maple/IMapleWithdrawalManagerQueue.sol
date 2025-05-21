// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/**
 * @title IMapleWithdrawalManagerQueue
 * @dev Interface for Maple Finance Queue-based Withdrawal Manager contracts
 * @notice This is for the FIFO queue withdrawal manager, which processes requests in order
 */
interface IMapleWithdrawalManagerQueue {
    /**
     * @notice Event emitted when a request is created
     */
    event RequestCreated(
        uint128 indexed requestId,
        address indexed owner,
        uint256 shares
    );

    /**
     * @notice Event emitted when a request is processed
     */
    event RequestProcessed(
        uint128 indexed requestId,
        address indexed owner,
        uint256 shares,
        uint256 assets
    );

    /**
     * @notice Event emitted when a request is removed
     */
    event RequestRemoved(uint128 indexed requestId);

    /**
     * @notice Event emitted when a request is decreased
     */
    event RequestDecreased(uint128 indexed requestId, uint256 shares);

    /**
     * @notice Get the asset address for this withdrawal manager
     * @return asset_ The address of the underlying asset
     */
    function asset() external view returns (address asset_);

    /**
     * @notice Get the pool address this withdrawal manager belongs to
     * @return The pool address
     */
    function pool() external view returns (address);

    /**
     * @notice Get the request ID for a specific owner
     * @param owner The owner address
     * @return The request ID for the owner
     */
    function requestIds(address owner) external view returns (uint128);

    /**
     * @notice Get the details of a request
     * @param requestId_ The request ID
     * @return owner_ The owner of the request
     * @return shares_ The amount of shares requested
     */
    function requests(uint128 requestId_) external view returns (address owner_, uint256 shares_);

    /**
     * @notice Get the current queue state
     * @return nextRequestId The next request ID to be processed
     * @return lastRequestId The last request ID in the queue
     */
    function queue() external view returns (uint128 nextRequestId, uint128 lastRequestId);

    /**
     * @notice Get the amount of shares locked for withdrawal for a specific owner
     * @param owner_ The owner address
     * @return lockedShares_ The amount of shares locked for withdrawal
     */
    function lockedShares(address owner_) external view returns (uint256 lockedShares_);

    /**
     * @notice Add shares to a user's locked position
     * @param shares_ Amount of shares to add
     * @param owner_ The owner of the shares
     */
    function addShares(uint256 shares_, address owner_) external;

    /**
     * @notice Remove shares from a withdrawal request
     * @param shares_ Amount of shares to remove
     * @param owner_ Owner of the shares
     * @return sharesReturned_ Amount of shares returned
     */
    function removeShares(uint256 shares_, address owner_) external returns (uint256 sharesReturned_);

    /**
     * @notice Remove a request entirely
     * @param owner_ The owner of the request
     */
    function removeRequest(address owner_) external;

    /**
     * @notice Process redemptions in the queue
     * @param maxSharesToProcess_ Maximum shares to process
     */
    function processRedemptions(uint256 maxSharesToProcess_) external;

    /**
     * @notice Process an exit for a specific owner
     * @param shares_ Amount of shares to process
     * @param owner_ Owner of the shares
     * @return redeemableShares_ Amount of shares redeemed
     * @return resultingAssets_ Amount of assets received
     */
    function processExit(uint256 shares_, address owner_) external returns (uint256 redeemableShares_, uint256 resultingAssets_);

    /**
     * @notice Preview redeem operation
     * @param owner_ Owner of the shares
     * @param shares_ Amount of shares to redeem
     * @return redeemableShares_ Amount of shares that can be redeemed
     * @return resultingAssets_ Amount of assets that would be received
     */
    function previewRedeem(address owner_, uint256 shares_) external view returns (uint256 redeemableShares_, uint256 resultingAssets_);

    /**
     * @notice Get the total amount of shares locked in the withdrawal manager
     * @return The total shares
     */
    function totalShares() external view returns (uint256);

    /**
     * @notice Check if a manual withdrawal is set for the owner
     * @param owner The owner address
     * @return Whether the owner has manual withdrawals set
     */
    function isManualWithdrawal(address owner) external view returns (bool);

    /**
     * @notice Get available manual shares for an owner
     * @param owner The owner address
     * @return The amount of manually available shares
     */
    function manualSharesAvailable(address owner) external view returns (uint256);

    /**
     * @notice Check if owner is in exit window (legacy function, always returns true for queue manager)
     * @param owner_ The owner address
     * @return isInExitWindow_ Always true for queue manager
     */
    function isInExitWindow(address owner_) external view returns (bool isInExitWindow_);

    /**
     * @notice Get locked liquidity (legacy function, always returns 0 for queue manager)
     * @return lockedLiquidity_ Always 0 for queue manager
     */
    function lockedLiquidity() external view returns (uint256 lockedLiquidity_);
} 