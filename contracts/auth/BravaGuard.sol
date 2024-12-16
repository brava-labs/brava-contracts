// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

import {Enum} from "../libraries/Enum.sol";
import {IBaseGuard} from "../interfaces/IBaseGuard.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";

/**
 * @title BravaGuard - A guard that enforces transaction rules and supports pre-approved admin operations
 * @dev This guard ensures transactions either:
 *      1. Are execTransaction/execTransactionFromModule calls with first destination being the sequenceExecutor, or
 *      2. Match a pre-approved transaction hash in the AdminVault
 */
contract BravaGuard is IBaseGuard {
    address public immutable SEQUENCE_EXECUTOR;
    IAdminVault public immutable ADMIN_VAULT;

    bytes4 private constant EXEC_TRANSACTION_SELECTOR = 0x6a761202;
    bytes4 private constant EXEC_FROM_MODULE_SELECTOR = 0x468721a7;

    event TransactionChecked(address indexed destination);

    constructor(address _sequenceExecutor, address _adminVault) {
        require(_sequenceExecutor != address(0), "Invalid executor address");
        require(_adminVault != address(0), "Invalid admin vault address");
        SEQUENCE_EXECUTOR = _sequenceExecutor;
        ADMIN_VAULT = IAdminVault(_adminVault);
    }

    function getTransactionHash(address to, bytes memory data, Enum.Operation operation) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(to, data, operation));
    }

    function validateTransaction(address to, uint256, bytes memory data, Enum.Operation operation) private view {
        bytes4 selector = bytes4(data);

        if (selector == EXEC_TRANSACTION_SELECTOR || selector == EXEC_FROM_MODULE_SELECTOR) {
            require(to == SEQUENCE_EXECUTOR, "First transaction must go to sequenceExecutor");
            return;
        }

        bytes32 txHash = getTransactionHash(to, data, operation);
        require(ADMIN_VAULT.isApprovedTransaction(txHash), "Transaction not allowed or pre-approved");
    }

    function checkTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external override {
        validateTransaction(to, value, data, operation);
        emit TransactionChecked(to);
    }

    function checkAfterExecution(bytes32, bool) external override {}

    function checkModuleTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        address
    ) external override returns (bytes32) {
        validateTransaction(to, value, data, operation);
        emit TransactionChecked(to);
        return getTransactionHash(to, data, operation);
    }

    function checkAfterModuleExecution(bytes32, bool) external override {}
}