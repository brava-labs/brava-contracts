// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

/// @title Yearn helper functions
abstract contract YearnHelper {

    function _poolId(address _vault) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_vault)));
    }
}
