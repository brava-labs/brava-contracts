// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISafe} from "../interfaces/safe/ISafe.sol";

library ParamSelectorLib {
    error ParamSelectorError(uint8);

    uint8 public constant WALLET_ADDRESS_PARAM_MAPPING = 254;
    uint8 public constant OWNER_ADDRESS_PARAM_MAPPING = 255;

    function _paramSelector(
        address _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal view returns (address) {
        if (_mapPosition != 0) {
            if (_mapPosition > _returnValues.length) {
                revert ParamSelectorError(_mapPosition);
            }
            /// @dev The last two values are specially reserved for proxy addr and owner addr
            if (_mapPosition == WALLET_ADDRESS_PARAM_MAPPING) return address(this); // wallet address
            if (_mapPosition == OWNER_ADDRESS_PARAM_MAPPING) return fetchOwnersOrWallet(); // owner if 1/1 wallet or the wallet itself

            return address(uint160(uint256(_returnValues[_mapPosition - 1])));
        }
        return _param;
    }

    function fetchOwnersOrWallet() internal view returns (address) {
        address[] memory owners = ISafe(address(this)).getOwners();
        return owners.length == 1 ? owners[0] : address(this);
    }

    // ==========================
    // ===== Start of bytes32 ====
    // ==========================

    /// @notice Given an bytes32 input, injects return/sub values if specified
    /// @param _param The original input value
    /// @param _mapPosition Indicates the position of the input in paramMapping
    /// @param _returnValues Array of data we can replace the input value with
    function _paramSelector(
        bytes32 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (bytes32) {
        if (_mapPosition != 0) {
            if (_mapPosition > _returnValues.length) {
                revert ParamSelectorError(_mapPosition);
            }
            return _returnValues[_mapPosition - 1];
        }
        return _param;
    }

    // ==========================
    // ===== Start of uint ======
    // ==========================

    /// @notice Given an uint256 input, injects return/sub values if specified
    /// @param _param The original input value
    /// @param _mapPosition Indicated the type of the input in paramMapping
    /// @param _returnValues Array of data we can replace the input value with
    function _paramSelector(
        uint256 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint256) {
        if (_mapPosition != 0) {
            if (_mapPosition > _returnValues.length) {
                revert ParamSelectorError(_mapPosition);
            }
            return uint256(_returnValues[_mapPosition - 1]);
        }
        return _param;
    }

    function _paramSelector(
        uint16 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint16) {
        return uint16(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint24 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint24) {
        return uint24(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint32 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint32) {
        return uint32(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint40 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint40) {
        return uint40(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint48 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint48) {
        return uint48(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint56 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint56) {
        return uint56(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint64 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint64) {
        return uint64(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint72 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint72) {
        return uint72(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint80 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint80) {
        return uint80(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint88 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint88) {
        return uint88(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint96 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint96) {
        return uint96(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint104 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint104) {
        return uint104(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint112 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint112) {
        return uint112(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint120 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint120) {
        return uint120(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint128 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint128) {
        return uint128(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint136 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint136) {
        return uint136(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint144 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint144) {
        return uint144(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint152 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint152) {
        return uint152(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint160 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint160) {
        return uint160(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint168 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint168) {
        return uint168(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint176 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint176) {
        return uint176(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint184 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint184) {
        return uint184(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint192 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint192) {
        return uint192(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint200 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint200) {
        return uint200(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint208 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint208) {
        return uint208(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint216 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint216) {
        return uint216(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint224 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint224) {
        return uint224(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint232 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint232) {
        return uint232(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint240 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint240) {
        return uint240(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        uint248 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (uint248) {
        return uint248(_paramSelector(uint256(_param), _mapPosition, _returnValues));
    }

    // ==========================
    // ===== Start of int =======
    // ==========================

    /// @notice Given an int256 input, injects return/sub values if specified
    /// @param _param The original input value
    /// @param _mapPosition Indicated the type of the input in paramMapping
    /// @param _returnValues Array of data we can replace the input value with
    function _paramSelector(
        int256 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int256) {
        if (_mapPosition != 0) {
            if (_mapPosition > _returnValues.length) {
                revert ParamSelectorError(_mapPosition);
            }
            return int256(uint256(_returnValues[_mapPosition - 1]));
        }
        return _param;
    }

    function _paramSelector(
        int8 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int8) {
        return int8(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int16 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int16) {
        return int16(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int24 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int24) {
        return int24(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int32 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int32) {
        return int32(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int40 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int40) {
        return int40(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int48 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int48) {
        return int48(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int56 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int56) {
        return int56(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int64 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int64) {
        return int64(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int72 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int72) {
        return int72(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int80 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int80) {
        return int80(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int88 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int88) {
        return int88(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int96 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int96) {
        return int96(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int104 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int104) {
        return int104(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int112 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int112) {
        return int112(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int120 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int120) {
        return int120(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int128 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int128) {
        return int128(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int136 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int136) {
        return int136(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int144 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int144) {
        return int144(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int152 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int152) {
        return int152(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int160 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int160) {
        return int160(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int168 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int168) {
        return int168(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int176 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int176) {
        return int176(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int184 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int184) {
        return int184(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int192 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int192) {
        return int192(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int200 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int200) {
        return int200(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int208 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int208) {
        return int208(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int216 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int216) {
        return int216(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int224 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int224) {
        return int224(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int232 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int232) {
        return int232(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int240 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int240) {
        return int240(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }

    function _paramSelector(
        int248 _param,
        uint8 _mapPosition,
        bytes32[] memory _returnValues
    ) internal pure returns (int248) {
        return int248(_paramSelector(int256(_param), _mapPosition, _returnValues));
    }
}
