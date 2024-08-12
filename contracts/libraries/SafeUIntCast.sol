// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;


library SafeUIntCast {

    /// @notice Convers a uint256 to uint128, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint128 value
    function toUint128(uint256 value) internal pure returns (uint128) {
        require(value <= type(uint128).max, "Value exceeds uint128 range");
        return uint128(value);
    }

    /// @notice Converts a uint256 to uint96, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint96 value
    function toUint96(uint256 value) internal pure returns (uint96) {
        require(value <= type(uint96).max, "Value exceeds uint96 range");
        return uint96(value);
    }

    /// @notice Converts a uint256 to uint64, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint64 value
    function toUint64(uint256 value) internal pure returns (uint64) {
        require(value <= type(uint64).max, "Value exceeds uint64 range");
        return uint64(value);
    }

    /// @notice Converts a uint256 to uint32, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint32 value
    function toUint32(uint256 value) internal pure returns (uint32) {
        require(value <= type(uint32).max, "Value exceeds uint32 range");
        return uint32(value);
    }

    /// @notice Converts a uint256 to uint24, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint24 value
    function toUint24(uint256 value) internal pure returns (uint24) {
        require(value <= type(uint24).max, "Value exceeds uint24 range");
        return uint24(value);
    }

    /// @notice Converts a uint256 to uint16, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint16 value
    function toUint16(uint256 value) internal pure returns (uint16) {
        require(value <= type(uint16).max, "Value exceeds uint16 range");
        return uint16(value);
    }

    /// @notice Converts a uint256 to uint8, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint8 value
    function toUint8(uint256 value) internal pure returns (uint8) {
        require(value <= type(uint8).max, "Value exceeds uint8 range");
        return uint8(value);
    }

    /// @notice Converts a uint256 to uint40, reverts if the value is out of range
    /// @param value The uint256 value to be converted
    /// @return The converted uint40 value
    function toUint40(uint256 value) internal pure returns (uint40) {
        require(value <= type(uint40).max, "Value exceeds uint40 range");
        return uint40(value);
    }
}