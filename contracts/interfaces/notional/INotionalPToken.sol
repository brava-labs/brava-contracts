// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INotionalPToken {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares);
    event ProxyRenamed();
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Withdraw(
        address indexed caller,
        address indexed receiver,
        address indexed owner,
        uint256 assets,
        uint256 shares
    );

    function EXCHANGE_RATE_PRECISION() external view returns (uint256);
    function NOTIONAL() external view returns (address);
    function allowance(address account, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool ret);
    function asset() external view returns (address);
    function balanceOf(address account) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256 assets);
    function convertToShares(uint256 assets) external view returns (uint256 shares);
    function currencyId() external view returns (uint16);
    function decimals() external view returns (uint8);
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function exchangeRate() external view returns (uint256 rate);
    function maxDeposit(address) external view returns (uint256 maxAssets);
    function maxMint(address) external view returns (uint256 maxShares);
    function maxRedeem(address owner) external view returns (uint256 maxShares);
    function maxWithdraw(address owner) external view returns (uint256 maxAssets);
    function mint(uint256 shares, address receiver) external returns (uint256 assets);
    function name() external view returns (string memory);
    function nativeDecimals() external view returns (uint8);
    function previewDeposit(uint256 assets) external view returns (uint256 shares);
    function previewMint(uint256 shares) external view returns (uint256 assets);
    function previewRedeem(uint256 shares) external view returns (uint256 assets);
    function previewWithdraw(uint256 assets) external view returns (uint256 shares);
    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets);
    function symbol() external view returns (string memory);
    function totalAssets() external view returns (uint256 totalManagedAssets);
    function totalSupply() external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool ret);
    function transferFrom(address from, address to, uint256 amount) external returns (bool ret);
    function underlying() external view returns (address);
    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares);
}
