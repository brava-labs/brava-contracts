// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @dev Omitted these imports as we don't need them and it just cascades into requiring more and more interfaces.
// import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
// import {IPoolFactory} from "./IPoolFactory.sol";
// import {IInterestRateModel} from "./IInterestRateModel.sol";

interface IClearpoolPool {
    // Custom Errors
    error AIZ(); // Amount Is Zero
    error AZ(); // Already Zero
    error CDC(); // Cannot Decrease Capacity
    error GTO(uint256 value); // Greater Than One
    error MTB(uint256 borrowed, uint256 repay); // More Than Borrowed
    error NEL(uint256 available); // Not Enough Liquidity
    error OA(); // Only Admin
    error OF(); // Only Factory
    error OG(); // Only Governor
    error OM(); // Only Manager

    // Events
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Borrowed(uint256 amount, address indexed receiver);
    event Closed();
    event Initialized(uint8 version);
    event MaximumCapacityChanged(uint256 newCapacity);
    event Provided(address indexed provider, uint256 currencyAmount, uint256 tokens);
    event Redeemed(address indexed redeemer, uint256 currencyAmount, uint256 tokens);
    event Repaid(uint256 amount);
    event ReservesTransferred(address treasury, uint256 amount);
    event RewardPerSecondSet(uint256 newRewardPerSecond);
    event RewardWithdrawn(address indexed account, uint256 amount);
    event Transfer(address indexed from, address indexed to, uint256 value);

    // View Functions
    function MINIMUM_LIQUIDITY() external view returns (uint256);
    function accumulativeRewardOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function availableToBorrow() external view returns (uint256);
    function availableToWithdraw() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function borrows() external view returns (uint256);
    function cash() external view returns (uint256);
    function currency() external view returns (address); // IERC20Upgradeable -> address
    function debtClaimed() external view returns (bool);
    function decimals() external view returns (uint8);
    function enteredProvisionalDefault() external view returns (uint256);
    function enteredZeroUtilization() external view returns (uint256);
    function factory() external view returns (address); // IPoolFactory -> address
    function getBorrowRate() external view returns (uint256);
    function getCurrentExchangeRate() external view returns (uint256);
    function getSupplyRate() external view returns (uint256);
    function getUtilizationRate() external view returns (uint256);
    function insurance() external view returns (uint256);
    function insuranceFactor() external view returns (uint256);
    function interest() external view returns (uint256);
    function interestRateModel() external view returns (address); // IInterestRateModel -> address
    function kycRequired() external view returns (bool);
    function lastAccrual() external view returns (uint256);
    function manager() external view returns (address);
    function maxInactivePeriod() external view returns (uint256);
    function maximumCapacity() external view returns (uint256);
    function name() external view returns (string memory);
    function ownerOfDebt() external view returns (address);
    function periodToStartAuction() external view returns (uint256);
    function poolSize() external view returns (uint256);
    function principal() external view returns (uint256);
    function provisionalDefaultUtilization() external view returns (uint256);
    function provisionalRepaymentUtilization() external view returns (uint256);
    function reserveFactor() external view returns (uint256);
    function reserves() external view returns (uint256);
    function rewardPerSecond() external view returns (uint256);
    function state() external view returns (uint8);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function version() external pure returns (string memory);
    function warningGracePeriod() external view returns (uint256);
    function warningUtilization() external view returns (uint256);
    function withdrawableRewardOf(address account) external view returns (uint256);
    function withdrawnRewardOf(address account) external view returns (uint256);

    // State-Changing Functions
    function allowWithdrawalAfterNoAuction() external;
    function approve(address spender, uint256 amount) external returns (bool);
    function borrow(uint256 amount, address receiver) external;
    function close() external;
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function forceDefault() external;
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function initialize(address manager_, address currency_, bool requireKYC) external; // currency_ is IERC20Upgradeable -> address
    function processAuctionStart() external;
    function processDebtClaim() external;
    function provide(uint256 currencyAmount) external;
    function provideFor(uint256 currencyAmount, address receiver) external;
    function provideForWithPermit(
        uint256 currencyAmount,
        address receiver,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function provideWithPermit(uint256 currencyAmount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
    function redeem(uint256 tokens) external;
    function redeemCurrency(uint256 currencyAmount) external;
    function repay(uint256 amount) external;
    function setInsuranceFactor(uint256 insuranceFactor_) external;
    function setInterestRateModel(address interestRateModel_) external; // IInterestRateModel -> address
    function setManager(address manager_) external;
    function setMaxCapacity(uint256 capacity) external;
    function setMaxInactivePeriod(uint256 maxInactivePeriod_) external;
    function setPeriodToStartAuction(uint256 periodToStartAuction_) external;
    function setProvisionalDefaultUtilization(uint256 provisionalDefaultUtilization_) external;
    function setProvisionalRepaymentUtilization(uint256 provisionalRepaymentUtilization_) external;
    function setReserveFactor(uint256 reserveFactor_) external;
    function setRewardPerSecond(uint256 rewardPerSecond_) external;
    function setSymbol(string memory symbol_) external;
    function setWarningGracePeriod(uint256 warningGracePeriod_) external;
    function setWarningUtilization(uint256 warningUtilization_) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transferReserves() external;
    function withdrawReward(address account) external returns (uint256);
}
