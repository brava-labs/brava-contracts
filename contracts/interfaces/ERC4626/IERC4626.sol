// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC20.sol";

/**
 * @title IERC4626
 * @dev Interface for the ERC4626 Tokenized Vault Standard
 * https://eips.ethereum.org/EIPS/eip-4626
 */
interface IERC4626 is IERC20 {
    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares);

    /*//////////////////////////////////////////////////////////////
                               METADATA
    //////////////////////////////////////////////////////////////*/

    /// @notice The address of the underlying token used for the Vault
    function asset() external view returns (address assetTokenAddress);

    /// @notice Total amount of the underlying asset managed by vault
    function totalAssets() external view returns (uint256 totalManagedAssets);

    /*//////////////////////////////////////////////////////////////
                            DEPOSIT/WITHDRAWAL
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Deposit assets and receive shares
     * @param assets Amount of assets to deposit
     * @param receiver Address to receive the shares
     * @return shares Amount of shares minted
     */
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);

    /**
     * @notice Mint exact shares by depositing assets
     * @param shares Amount of shares to mint
     * @param receiver Address to receive the shares
     * @return assets Amount of assets deposited
     */
    function mint(uint256 shares, address receiver) external returns (uint256 assets);

    /**
     * @notice Withdraw assets by burning shares
     * @param assets Amount of assets to withdraw
     * @param receiver Address to receive assets
     * @param owner Owner of the shares
     * @return shares Amount of shares burned
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    ) external returns (uint256 shares);

    /**
     * @notice Redeem shares for assets
     * @param shares Amount of shares to redeem
     * @param receiver Address to receive assets
     * @param owner Owner of the shares
     * @return assets Amount of assets withdrawn
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    ) external returns (uint256 assets);

    /*//////////////////////////////////////////////////////////////
                            ACCOUNTING
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Preview deposit
     * @param assets Amount of assets to deposit
     * @return shares Expected amount of shares to mint
     */
    function previewDeposit(uint256 assets) external view returns (uint256 shares);

    /**
     * @notice Preview mint
     * @param shares Amount of shares to mint
     * @return assets Expected amount of assets needed
     */
    function previewMint(uint256 shares) external view returns (uint256 assets);

    /**
     * @notice Preview withdraw
     * @param assets Amount of assets to withdraw
     * @return shares Expected amount of shares needed
     */
    function previewWithdraw(uint256 assets) external view returns (uint256 shares);

    /**
     * @notice Preview redeem
     * @param shares Amount of shares to redeem
     * @return assets Expected amount of assets to receive
     */
    function previewRedeem(uint256 shares) external view returns (uint256 assets);

    /*//////////////////////////////////////////////////////////////
                            CONVERSION
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Convert assets to shares
     * @param assets Amount of assets to convert
     * @return shares Equivalent amount of shares
     */
    function convertToShares(uint256 assets) external view returns (uint256 shares);

    /**
     * @notice Convert shares to assets
     * @param shares Amount of shares to convert
     * @return assets Equivalent amount of assets
     */
    function convertToAssets(uint256 shares) external view returns (uint256 assets);

    /*//////////////////////////////////////////////////////////////
                            LIMITS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Maximum deposit possible
     * @param receiver Address that would receive shares
     * @return maxAssets Maximum amount of assets that can be deposited
     */
    function maxDeposit(address receiver) external view returns (uint256 maxAssets);

    /**
     * @notice Maximum mint possible
     * @param receiver Address that would receive shares
     * @return maxShares Maximum amount of shares that can be minted
     */
    function maxMint(address receiver) external view returns (uint256 maxShares);

    /**
     * @notice Maximum withdrawal possible
     * @param owner Address that owns the shares
     * @return maxAssets Maximum amount of assets that can be withdrawn
     */
    function maxWithdraw(address owner) external view returns (uint256 maxAssets);

    /**
     * @notice Maximum redemption possible
     * @param owner Address that owns the shares
     * @return maxShares Maximum amount of shares that can be redeemed
     */
    function maxRedeem(address owner) external view returns (uint256 maxShares);
}