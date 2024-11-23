// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAavePool} from "../common/IAavePool.sol";

interface ILendingPool is IAavePool {
    // V2-specific events
    event Paused();
    event RebalanceStableBorrowRate(address indexed reserve, address indexed user);
    event ReserveDataUpdated(
        address indexed reserve,
        uint256 liquidityRate,
        uint256 stableBorrowRate,
        uint256 variableBorrowRate,
        uint256 liquidityIndex,
        uint256 variableBorrowIndex
    );
    event ReserveUsedAsCollateralDisabled(address indexed reserve, address indexed user);
    event ReserveUsedAsCollateralEnabled(address indexed reserve, address indexed user);
    event Swap(address indexed reserve, address indexed user, uint256 rateMode);
    event TokensRescued(address indexed tokenRescued, address indexed receiver, uint256 amountRescued);
    event Unpaused();

    // V2-specific functions
    //solhint-disable-next-line func-name-mixedcase
    function LENDINGPOOL_REVISION() external view returns (uint256);
    //solhint-disable-next-line func-name-mixedcase
    function MAX_STABLE_RATE_BORROW_SIZE_PERCENT() external view returns (uint256);

    function deposit(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function finalizeTransfer(
        address asset,
        address from,
        address to,
        uint256 amount,
        uint256 balanceFromBefore,
        uint256 balanceToBefore
    ) external;

    function flashLoan(
        address receiverAddress,
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata modes,
        address onBehalfOf,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function getConfiguration(address asset) external view returns (uint256);
    function getAddressesProvider() external view returns (address);

    function getReserveData(
        address asset
    )
        external
        view
        returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 variableBorrowIndex,
            uint128 currentLiquidityRate,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint8 id
        );

    function getUserConfiguration(address user) external view returns (uint256);

    function initReserve(
        address asset,
        address aTokenAddress,
        address stableDebtAddress,
        address variableDebtAddress,
        address interestRateStrategyAddress
    ) external;

    function initialize(address provider) external;
    function paused() external view returns (bool);
    function rebalanceStableBorrowRate(address asset, address user) external;
    function rescueTokens(address token, address to, uint256 amount) external;
    function setConfiguration(address asset, uint256 configuration) external;
    function setPause(bool val) external;
    function setReserveInterestRateStrategyAddress(address asset, address rateStrategyAddress) external;
    function swapBorrowRateMode(address asset, uint256 rateMode) external;
    function swapToVariable(address asset, address user) external;
}
