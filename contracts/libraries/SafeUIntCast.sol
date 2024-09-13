// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

library SafeUIntCast {
    error ValueExceedsRangeOfUint(uint8 size);

    /// @notice Convers a uint256 to uint128, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint128 value
    function toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) {
            revert ValueExceedsRangeOfUint(128);
        }
        return uint128(value);
    }

    /// @notice Converts a uint256 to uint96, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint96 value
    function toUint96(uint256 value) internal pure returns (uint96) {
        if (value > type(uint96).max) {
            revert ValueExceedsRangeOfUint(96);
        }
        return uint96(value);
    }

    /// @notice Converts a uint256 to uint64, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint64 value
    function toUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) {
            revert ValueExceedsRangeOfUint(64);
        }
        return uint64(value);
    }

    /// @notice Converts a uint256 to uint40, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint40 value
    function toUint40(uint256 value) internal pure returns (uint40) {
        if (value > type(uint40).max) {
            revert ValueExceedsRangeOfUint(40);
        }
        return uint40(value);
    }

    /// @notice Converts a uint256 to uint32, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint32 value
    function toUint32(uint256 value) internal pure returns (uint32) {
        if (value > type(uint32).max) {
            revert ValueExceedsRangeOfUint(32);
        }
        return uint32(value);
    }

    /// @notice Converts a uint256 to uint24, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint24 value
    function toUint24(uint256 value) internal pure returns (uint24) {
        if (value > type(uint24).max) {
            revert ValueExceedsRangeOfUint(24);
        }
        return uint24(value);
    }

    /// @notice Converts a uint256 to uint16, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint16 value
    function toUint16(uint256 value) internal pure returns (uint16) {
        if (value > type(uint16).max) {
            revert ValueExceedsRangeOfUint(16);
        }
        return uint16(value);
    }

    /// @notice Converts a uint256 to uint8, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint8 value
    function toUint8(uint256 value) internal pure returns (uint8) {
        if (value > type(uint8).max) {
            revert ValueExceedsRangeOfUint(8);
        }
        return uint8(value);
    }
}
