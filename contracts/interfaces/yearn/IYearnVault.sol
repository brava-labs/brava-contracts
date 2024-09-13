// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

interface IYearnVault {
    function deposit(uint256 _amount, address _recipient) external returns (uint256 _shares);
    function withdraw(uint256 _maxShares, address _recipient) external returns (uint256 _tokens);
    function token() external view returns (address);
}
