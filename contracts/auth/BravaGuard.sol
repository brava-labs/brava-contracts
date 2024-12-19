// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Enum} from "../libraries/Enum.sol";
import {IAdminVault} from "../interfaces/IAdminVault.sol";
import {ITransactionGuard, IModuleGuard} from "../interfaces/safe/IGuard.sol";

/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/**
 * @title BravaGuard - A guard that enforces transaction rules with support for pre-approved admin operations
 * @dev This guard ensures transactions follow one of two valid paths:
 *      1. Normal Operations (Primary Path):
 *         - Must target the sequenceExecutor
 *         - All state-changing Safe operations will go through execTransaction/execTransactionFromModule
 *      2. Administrative Operations (Secondary Path):
 *         - For operations like guard upgrades, Safe upgrades, or other admin functions
 *         - Transaction hash must be pre-approved in the AdminVault
 *         - Allows users to perform verified administrative actions without central coordination
 */
contract BravaGuard is ITransactionGuard, IModuleGuard {
    address public immutable SEQUENCE_EXECUTOR;
    IAdminVault public immutable ADMIN_VAULT;

    error BravaGuard_InvalidAddress();
    error BravaGuard_TransactionNotAllowed();

    constructor(address _sequenceExecutor, address _adminVault) {
        require(_sequenceExecutor != address(0) && _adminVault != address(0), BravaGuard_InvalidAddress());
        SEQUENCE_EXECUTOR = _sequenceExecutor;
        ADMIN_VAULT = IAdminVault(_adminVault);
    }

    function getTransactionHash(
        address to,
        bytes memory data,
        Enum.Operation operation
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(to, data, operation));
    }

    /// @dev Validates if a transaction is allowed to proceed
    /// @dev Reverts if the transaction is neither targeting the sequence executor nor pre-approved in the admin vault
    function validateTransaction(address to, bytes memory data, Enum.Operation operation) private view {
        // Check primary path: transaction to sequenceExecutor
        if (to == SEQUENCE_EXECUTOR) {
            return;
        }

        // Check secondary path: pre-approved administrative operation
        bytes32 txHash = getTransactionHash(to, data, operation);
        require(ADMIN_VAULT.isApprovedTransaction(txHash), BravaGuard_TransactionNotAllowed());
    }

    function checkTransaction(
        address to,
        uint256,
        bytes memory data,
        Enum.Operation operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external view override {
        validateTransaction(to, data, operation);
    }

    function checkAfterExecution(bytes32, bool) external pure override {}

    function checkModuleTransaction(
        address to,
        uint256,
        bytes memory data,
        Enum.Operation operation,
        address
    ) external view override returns (bytes32) {
        validateTransaction(to, data, operation);
        return getTransactionHash(to, data, operation);
    }

    function checkAfterModuleExecution(bytes32, bool) external pure override {}

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(ITransactionGuard).interfaceId || // 0xe6d7a83a
            interfaceId == type(IModuleGuard).interfaceId || // 0x58401ed8
            interfaceId == type(IERC165).interfaceId; // 0x01ffc9a7
    }
}
