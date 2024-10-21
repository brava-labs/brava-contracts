// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

// @dev Debug contract, too many warnings
//solhint-disable

import {SequenceExecutor} from "./SequenceExecutor.sol";
import {IAdminVault} from "./interfaces/IAdminVault.sol";
import "hardhat/console.sol";

// @dev Basically the same as SequenceExecutor, but with debug prints
// @dev This is to be used for debugging only
contract SequenceExecutorDebug is SequenceExecutor {
    constructor(address _adminVault) SequenceExecutor(_adminVault) {}

    function executeSequence(Sequence calldata _currSequence) public payable virtual override {
        console.log("Executing sequence:", _currSequence.name);
        console.log("Number of actions:", _currSequence.actionIds.length);

        // Add check that the sequence is valid
        for (uint256 i = 0; i < _currSequence.actionIds.length; ++i) {
            try ADMIN_VAULT.getActionAddress(_currSequence.actionIds[i]) returns (address actionAddr) {
                console.log("Action address from vault:", actionAddr);
            } catch {
                console.log("Action not found in vault");
                revert("Invalid sequence");
            }
        }

        super.executeSequence(_currSequence);
    }

    function _executeAction(Sequence memory _currSequence, uint256 _index) internal override {
        address actionAddr = ADMIN_VAULT.getActionAddress(_currSequence.actionIds[_index]);
        bytes memory callData = _currSequence.callData[_index];

        console.log("Executing action %d:", _index);
        console.log("  Action ID:", uint256(uint32(_currSequence.actionIds[_index])));
        console.log("  Action Address:", actionAddr);
        // @dev Uncomment if you really really want to see the call data (you dont!)
        // console.logBytes(callData);

        // Perform low-level delegatecall (we can't use try/catch here)
        (bool success, bytes memory returnData) = actionAddr.delegatecall(callData);

        if (success) {
            console.log("Action executed successfully");
            console.logBytes(returnData);
        } else {
            console.log("Action failed");
            console.log("  Failed Action Address:", actionAddr);

            string memory revertReason = _decodeRevertReason(returnData);
            console.log("Revert reason:", revertReason);

            revert(revertReason);
        }
    }

    function _decodeRevertReason(bytes memory _returnData) internal pure returns (string memory) {
        if (_returnData.length < 68) return "Transaction reverted silently";

        bytes4 selector;
        assembly {
            selector := mload(add(_returnData, 0x20))
        }

        if (selector == bytes4(keccak256("Error(string)"))) {
            bytes memory revertData = slice(_returnData, 4, _returnData.length - 4);
            return abi.decode(revertData, (string));
        } else if (selector == bytes4(keccak256("Panic(uint256)"))) {
            bytes memory revertData = slice(_returnData, 4, _returnData.length - 4);
            uint256 errorCode = abi.decode(revertData, (uint256));
            return _getPanicReason(errorCode);
        } else {
            return string(abi.encodePacked("Unknown error: ", _toHexString(uint256(uint32(selector)))));
        }
    }

    function _getPanicReason(uint256 _errorCode) internal pure returns (string memory) {
        if (_errorCode == 0x01) return "Assertion failed";
        if (_errorCode == 0x11) return "Arithmetic overflow or underflow";
        if (_errorCode == 0x12) return "Division or modulo by zero";
        if (_errorCode == 0x21) return "Invalid enum value";
        if (_errorCode == 0x22) return "Storage byte array that is incorrectly encoded";
        if (_errorCode == 0x31) return "pop() on an empty array";
        if (_errorCode == 0x32) return "Array index out of bounds";
        if (_errorCode == 0x41) return "Allocation of too much memory or array too large";
        if (_errorCode == 0x51) return "Call to a zero-initialized variable of internal function type";
        return string(abi.encodePacked("Unknown panic code: ", _toHexString(_errorCode)));
    }

    function _toHexString(uint256 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(64);
        uint256 current = value;
        for (uint256 idx = 63; idx >= 0; idx--) {
            uint8 nibble = uint8(current % 16);
            buffer[idx] = nibble < 10 ? bytes1(nibble + 48) : bytes1(nibble + 87);
            current /= 16;
            if (current == 0) break;
        }
        bytes memory result = new bytes(2 + 64);
        result[0] = "0";
        result[1] = "x";
        for (uint256 j = 0; j < 64; j++) {
            result[j + 2] = buffer[j];
        }
        return string(result);
    }

    function slice(bytes memory _bytes, uint256 _start, uint256 _length) internal pure returns (bytes memory) {
        require(_length + 31 >= _length, "slice_overflow");
        require(_start + _length <= _bytes.length, "slice_outOfBounds");

        bytes memory tempBytes;
        assembly {
            switch iszero(_length)
            case 0 {
                tempBytes := mload(0x40)
                let lengthmod := and(_length, 31)
                let mc := add(add(tempBytes, lengthmod), mul(0x20, iszero(lengthmod)))
                let end := add(mc, _length)

                for {
                    let cc := add(add(add(_bytes, lengthmod), mul(0x20, iszero(lengthmod))), _start)
                } lt(mc, end) {
                    mc := add(mc, 0x20)
                    cc := add(cc, 0x20)
                } {
                    mstore(mc, mload(cc))
                }

                mstore(tempBytes, _length)
                mstore(0x40, and(add(mc, 31), not(31)))
            }
            default {
                tempBytes := mload(0x40)
                mstore(tempBytes, 0)
                mstore(0x40, add(tempBytes, 0x20))
            }
        }
        return tempBytes;
    }
}
