// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAaveToken} from "../common/IAaveToken.sol";

interface IATokenV3 is IAaveToken {
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

    function getIncentivesController() external view returns (address);
    function getPreviousIndex(address user) external view returns (uint256);
    function getScaledUserBalanceAndSupply(address user) external view returns (uint256, uint256);
    function handleRepayment(address user, address onBehalfOf, uint256 amount) external;
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
    function mintToTreasury(uint256 amount, uint256 index) external;
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
    function setIncentivesController(address controller) external;
    function transferUnderlyingTo(address target, uint256 amount) external;
}
