// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

abstract contract IYearnRegistry {
    function latestVault(address _token) external view virtual returns (address);
}
