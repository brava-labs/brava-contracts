// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC4626} from "../../interfaces/common/IERC4626.sol";

/**
 * @title IMaplePool
 * @dev Interface for Maple Finance Pool contracts that extend the ERC4626 standard with a two-step withdrawal process
 */
interface IMaplePool is IERC4626 {
    /**
     * @notice Request to redeem a specific amount of shares
     * @param shares_ Amount of shares to redeem
     * @param owner_ Owner of the shares
     * @return escrowedShares_ Amount of shares that have been escrowed for withdrawal
     */
    function requestRedeem(uint256 shares_, address owner_) external returns (uint256 escrowedShares_);

    /**
     * @notice Request to withdraw a specific amount of assets
     * @param assets_ Amount of assets to withdraw
     * @param owner_ Owner of the shares
     * @return escrowedShares_ Amount of shares that have been escrowed for withdrawal
     */
    function requestWithdraw(uint256 assets_, address owner_) external returns (uint256 escrowedShares_);

    /**
     * @notice Remove shares that were previously requested for redemption
     * @param shares_ Amount of shares to remove
     * @param owner_ Owner of the shares
     * @return sharesReturned_ Amount of shares that were returned
     */
    function removeShares(uint256 shares_, address owner_) external returns (uint256 sharesReturned_);

    /**
     * @notice Additional conversion function for exit shares
     * @param shares_ Amount of shares to convert to exit assets
     * @return assets_ Equivalent amount of assets
     */
    function convertToExitAssets(uint256 shares_) external view returns (uint256 assets_);

    /**
     * @notice Additional conversion function for exit shares
     * @param amount_ Amount of assets to convert to exit shares
     * @return shares_ Equivalent amount of shares needed for exit
     */
    function convertToExitShares(uint256 amount_) external view returns (uint256 shares_);

    /**
     * @notice Get amount of unrealized losses in the pool
     * @return unrealizedLosses_ Amount of unrealized losses
     */
    function unrealizedLosses() external view returns (uint256 unrealizedLosses_);

    /**
     * @notice Get the address of the pool's manager
     * @return The address of the pool manager contract
     */
    function manager() external view returns (address);

    /// @notice Returns the address of the withdrawal manager associated with this pool
    function withdrawalManager() external view returns (address);
} 