// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IATokenV2 {
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event BalanceTransfer(address indexed from, address indexed to, uint256 value, uint256 index);
    event Burn(address indexed from, address indexed target, uint256 value, uint256 index);
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
    event Mint(address indexed from, uint256 value, uint256 index);
    event Transfer(address indexed from, address indexed to, uint256 value);

    // solhint-disable-next-line func-name-mixedcase
    function ATOKEN_REVISION() external view returns (uint256);
    //solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    //solhint-disable-next-line func-name-mixedcase
    function EIP712_REVISION() external view returns (bytes memory);
    //solhint-disable-next-line func-name-mixedcase
    function PERMIT_TYPEHASH() external view returns (bytes32);
    //solhint-disable-next-line func-name-mixedcase
    function POOL() external view returns (address);
    //solhint-disable-next-line func-name-mixedcase
    function RESERVE_TREASURY_ADDRESS() external view returns (address);
    //solhint-disable-next-line func-name-mixedcase
    function UINT_MAX_VALUE() external view returns (uint256);
    //solhint-disable-next-line func-name-mixedcase
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    //solhint-disable-next-line func-name-mixedcase
    function _nonces(address) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address user) external view returns (uint256);
    function burn(address user, address receiverOfUnderlying, uint256 amount, uint256 index) external;
    function decimals() external view returns (uint8);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function getIncentivesController() external view returns (address);
    function getScaledUserBalanceAndSupply(address user) external view returns (uint256, uint256);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function initialize(uint8 underlyingAssetDecimals, string memory tokenName, string memory tokenSymbol) external;
    function mint(address user, uint256 amount, uint256 index) external returns (bool);
    function mintToTreasury(uint256 amount, uint256 index) external;
    function name() external view returns (string memory);
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function scaledBalanceOf(address user) external view returns (uint256);
    function scaledTotalSupply() external view returns (uint256);
    function symbol() external view returns (string memory);
    function totalSupply() external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transferOnLiquidation(address from, address to, uint256 value) external;
    function transferUnderlyingTo(address target, uint256 amount) external returns (uint256);
}
