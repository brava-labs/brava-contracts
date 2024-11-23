// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAavePool} from "../common/IAavePool.sol";

interface IPool is IAavePool {
    // V3-specific structs
    struct ReserveConfigurationMap {
        uint256 data;
    }

    struct ReserveData {
        ReserveConfigurationMap configuration;
        uint128 liquidityIndex;
        uint128 currentLiquidityRate;
        uint128 variableBorrowIndex;
        uint128 currentVariableBorrowRate;
        uint128 currentStableBorrowRate;
        uint40 lastUpdateTimestamp;
        uint16 id;
        address aTokenAddress;
        address stableDebtTokenAddress;
        address variableDebtTokenAddress;
        address interestRateStrategyAddress;
        uint128 accruedToTreasury;
        uint128 unbacked;
        uint128 isolationModeTotalDebt;
    }

    struct UserConfigurationMap {
        uint256 data;
    }

    // V3-specific functions
    // solhint-disable-next-line func-name-mixedcase
    function ADDRESSES_PROVIDER() external view returns (address);
    // solhint-disable-next-line func-name-mixedcase
    function BRIDGE_PROTOCOL_FEE() external view returns (uint256);
    // solhint-disable-next-line func-name-mixedcase
    function FLASHLOAN_PREMIUM_TO_PROTOCOL() external view returns (uint128);
    // solhint-disable-next-line func-name-mixedcase
    function POOL_REVISION() external view returns (uint256);

    function backUnbacked(address asset, uint256 amount, uint256 fee) external returns (uint256);
    function dropReserve(address asset) external;

    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes memory params,
        uint16 referralCode
    ) external;

    function getConfiguration(address asset) external view returns (ReserveConfigurationMap memory);
    function getReserveData(address asset) external view returns (ReserveData memory);
    function getUserConfiguration(address user) external view returns (UserConfigurationMap memory);

    function initReserve(
        address asset,
        address aTokenAddress,
        address variableDebtAddress,
        address interestRateStrategyAddress
    ) external;

    function mintToTreasury(address[] memory assets) external;
    function mintUnbacked(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function repayWithATokens(address asset, uint256 amount, uint256 interestRateMode) external returns (uint256);

    function repayWithPermit(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        address onBehalfOf,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external returns (uint256);

    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function supplyWithPermit(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external;
}
