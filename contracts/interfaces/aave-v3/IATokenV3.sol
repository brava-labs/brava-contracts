// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IATokenV3 {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event BalanceTransfer(address indexed from, address indexed to, uint256 value, uint256 index);
    event Burn(address indexed from, address indexed target, uint256 value, uint256 balanceIncrease, uint256 index);
    event Initialized(
        address indexed underlyingAsset,
        address indexed pool,
        address treasury,
        address incentivesController,
        uint8 aTokenDecimals,
        string aTokenName,
        string aTokenSymbol,
        bytes params
    );
    event Mint(
        address indexed caller,
        address indexed onBehalfOf,
        uint256 value,
        uint256 balanceIncrease,
        uint256 index
    );
    event Transfer(address indexed from, address indexed to, uint256 value);

    // solhint-disable-next-line func-name-mixedcase
    function ATOKEN_REVISION() external view returns (uint256);
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    // solhint-disable-next-line func-name-mixedcase
    function EIP712_REVISION() external view returns (bytes memory);
    // solhint-disable-next-line func-name-mixedcase
    function PERMIT_TYPEHASH() external view returns (bytes32);
    // solhint-disable-next-line func-name-mixedcase
    function POOL() external view returns (address);
    // solhint-disable-next-line func-name-mixedcase
    function RESERVE_TREASURY_ADDRESS() external view returns (address);
    // solhint-disable-next-line func-name-mixedcase
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address user) external view returns (uint256);
    function burn(address from, address receiverOfUnderlying, uint256 amount, uint256 index) external;
    function decimals() external view returns (uint8);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function getIncentivesController() external view returns (address);
    function getPreviousIndex(address user) external view returns (uint256);
    function getScaledUserBalanceAndSupply(address user) external view returns (uint256, uint256);
    function handleRepayment(address user, address onBehalfOf, uint256 amount) external;
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function initialize(
        address initializingPool,
        address treasury,
        address underlyingAsset,
        address incentivesController,
        uint8 aTokenDecimals,
        string memory aTokenName,
        string memory aTokenSymbol,
        bytes memory params
    ) external;
    function mint(address caller, address onBehalfOf, uint256 amount, uint256 index) external returns (bool);
    function mintToTreasury(uint256 amount, uint256 index) external;
    function name() external view returns (string memory);
    function nonces(address owner) external view returns (uint256);
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function rescueTokens(address token, address to, uint256 amount) external;
    function scaledBalanceOf(address user) external view returns (uint256);
    function scaledTotalSupply() external view returns (uint256);
    function setIncentivesController(address controller) external;
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transferOnLiquidation(address from, address to, uint256 value) external;
    function transferUnderlyingTo(address target, uint256 amount) external;
}
