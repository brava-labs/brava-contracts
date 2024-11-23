// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IAaveToken} from "../common/IAaveToken.sol";

interface IATokenV2 is IAaveToken {
    // Additional V2-specific events
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
    event Burn(address indexed from, address indexed target, uint256 value, uint256 index);

    // V2-specific functions
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
    function _nonces(address) external view returns (uint256);

    function getIncentivesController() external view returns (address);
    function getScaledUserBalanceAndSupply(address user) external view returns (uint256, uint256);
    function initialize(uint8 underlyingAssetDecimals, string memory tokenName, string memory tokenSymbol) external;
    function mintToTreasury(uint256 amount, uint256 index) external;
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function transferUnderlyingTo(address target, uint256 amount) external returns (uint256);
}
