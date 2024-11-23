// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice A version agnostic interface for aToken contracts
/// @dev contains all common events/functions between aave v2 and v3
interface IAaveToken {
    // Events
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event BalanceTransfer(address indexed from, address indexed to, uint256 value, uint256 index);

    // View Functions
    // solhint-disable-next-line func-name-mixedcase
    function UINT_MAX_VALUE() external view returns (uint256);
    // solhint-disable-next-line func-name-mixedcase
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address user) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function scaledBalanceOf(address user) external view returns (uint256);
    function scaledTotalSupply() external view returns (uint256);

    // State-Changing Functions
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function increaseAllowance(address spender, uint256 addedValue) external returns (bool);
    function decreaseAllowance(address spender, uint256 subtractedValue) external returns (bool);
    function transferOnLiquidation(address from, address to, uint256 value) external;

    // Common Mint/Burn Functions
    function mint(address user, uint256 amount, uint256 index) external returns (bool);
    function burn(address user, address receiverOfUnderlying, uint256 amount, uint256 index) external;
}
