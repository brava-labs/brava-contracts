// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

/// @title Fluid helper functions
abstract contract FluidHelper {

    function _poolId(address _fToken) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_fToken)));
    }
}
