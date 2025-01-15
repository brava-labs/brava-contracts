// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {CometStructs} from "./CometStructs.sol";

/// @title IComet - Interface for Compound III's Comet contract
/// @notice Interface for interacting with Compound III markets
interface IComet {
    function baseScale() external view returns (uint);
    function supply(address asset, uint amount) external;
    function withdraw(address asset, uint amount) external;

    function getSupplyRate(uint utilization) external view returns (uint);
    function getBorrowRate(uint utilization) external view returns (uint);

    function getAssetInfoByAddress(address asset) external view returns (CometStructs.AssetInfo memory);
    function getAssetInfo(uint8 i) external view returns (CometStructs.AssetInfo memory);

    function getPrice(address priceFeed) external view returns (uint128);

    function userBasic(address) external view returns (CometStructs.UserBasic memory);
    function totalsBasic() external view returns (CometStructs.TotalsBasic memory);
    function userCollateral(address, address) external view returns (CometStructs.UserCollateral memory);

    function baseTokenPriceFeed() external view returns (address);
    function baseToken() external view returns (address);

    function numAssets() external view returns (uint8);

    function getUtilization() external view returns (uint);

    function baseTrackingSupplySpeed() external view returns (uint);
    function baseTrackingBorrowSpeed() external view returns (uint);

    function totalSupply() external view returns (uint256);
    function totalBorrow() external view returns (uint256);

    function baseIndexScale() external pure returns (uint64);

    function totalsCollateral(address asset) external view returns (CometStructs.TotalsCollateral memory);

    function baseMinForRewards() external view returns (uint256);

    /// @notice Get the balance of an account
    /// @param account The account to check
    /// @return The balance in base asset
    function balanceOf(address account) external view returns (uint256);
} 