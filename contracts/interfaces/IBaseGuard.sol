// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

import {Enum} from "../libraries/Enum.sol";

interface IBaseGuard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes memory signatures,
        address msgSender
    ) external;

    function checkAfterExecution(bytes32 txHash, bool success) external;
    
    function checkModuleTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        address module
    ) external returns (bytes32);
    
    function checkAfterModuleExecution(bytes32 txHash, bool success) external;
} 