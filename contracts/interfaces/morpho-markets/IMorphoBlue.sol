// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

type Id is bytes32;

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

struct Position {
    uint256 supplyShares;
    uint128 borrowShares;
    uint128 collateral;
}

struct Market {
    uint128 totalSupplyAssets;
    uint128 totalSupplyShares;
    uint128 totalBorrowAssets;
    uint128 totalBorrowShares;
    uint128 lastUpdate;
    uint128 fee;
}

/// @title IMorphoBlue - Minimal interface for the Morpho Blue singleton contract
/// @notice Only the functions needed by the Brava MorphoMarkets actions are included
interface IMorphoBlue {
    /// @notice Supplies assets or shares to a market on behalf of `onBehalf`
    /// @dev Exactly one of `assets` or `shares` must be zero
    function supply(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes memory data
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied);

    /// @notice Withdraws assets or shares from a market
    /// @dev Exactly one of `assets` or `shares` must be zero
    function withdraw(
        MarketParams memory marketParams,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

    /// @notice Returns the position of `user` on the market corresponding to `id`
    function position(Id id, address user) external view returns (Position memory p);

    /// @notice Returns the state of the market corresponding to `id`
    function market(Id id) external view returns (Market memory m);

    /// @notice Returns the market params corresponding to `id`
    function idToMarketParams(Id id) external view returns (MarketParams memory);

    /// @notice Accrues interest for the given market
    function accrueInterest(MarketParams memory marketParams) external;
}
