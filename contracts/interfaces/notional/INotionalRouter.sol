// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface INotionalRouter {
    /// @notice Deposits an underlying token (like USDC, DAI, etc.) into Notional
    /// @param account The account to deposit for
    /// @param currencyId The currency id of the token being deposited
    /// @param amountExternalPrecision The amount to deposit in the token's native precision
    /// @return The amount of pToken minted
    function depositUnderlyingToken(
        address account,
        uint16 currencyId,
        uint256 amountExternalPrecision
    ) external payable returns (uint256);

    /// @notice Withdraws assets from Notional
    /// @param currencyId The currency id to withdraw
    /// @param amountInternalPrecision The amount to withdraw in internal precision
    /// @param redeemToUnderlying If true, redeems to the underlying token
    /// @return The amount withdrawn in external precision
    function withdraw(
        uint16 currencyId,
        uint88 amountInternalPrecision,
        bool redeemToUnderlying
    ) external returns (uint256);

    /// @notice Withdraws via a proxy contract
    /// @param currencyId The currency id to withdraw
    /// @param account The account to withdraw from
    /// @param receiver The address to receive the withdrawn tokens
    /// @param spender The address approved to spend the tokens
    /// @param withdrawAmountPrimeCash The amount of prime cash to withdraw
    /// @return The amount withdrawn in external precision
    function withdrawViaProxy(
        uint16 currencyId,
        address account,
        address receiver,
        address spender,
        uint88 withdrawAmountPrimeCash
    ) external returns (uint256);

    /// @notice Settles an account's mature fCash positions
    /// @param account The account to settle
    /// @return True if the settlement was successful
    function settleAccount(address account) external returns (bool);

    /// @notice Enables bitmap currency for an account
    /// @param currencyId The currency to enable bitmap for
    function enableBitmapCurrency(uint16 currencyId) external;

    /// @notice Enables or disables prime borrow capability
    /// @param allowPrimeBorrow True to enable prime borrow
    function enablePrimeBorrow(bool allowPrimeBorrow) external;

    /// @notice Redeems nTokens for the underlying asset
    /// @param redeemer The account redeeming the nTokens
    /// @param currencyId The currency id of the nToken
    /// @param tokensToRedeem_ The amount of nTokens to redeem
    /// @return The amount of underlying tokens received
    function nTokenRedeem(
        address redeemer,
        uint16 currencyId,
        uint96 tokensToRedeem_
    ) external returns (int256);

    /// @notice Returns various library addresses used by Notional
    function getLibInfo() external pure returns (address, address, address);
    
    /// @notice Returns the owner of the Notional protocol
    function owner() external view returns (address);
    
    /// @notice Returns the pause guardian address
    function pauseGuardian() external view returns (address);
    
    /// @notice Returns the pause router address
    function pauseRouter() external view returns (address);
} 