// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Enum} from "../libraries/Enum.sol";
import {ITransactionGuard, IModuleGuard} from "../interfaces/safe/IGuard.sol";

/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
/**
 * @title BravaGuard - A guard that enforces transaction rules
 * @dev This guard ensures all transactions go through the sequence executor
 *      All state-changing Safe operations will go through execTransaction/execTransactionFromModule
 */
contract BravaGuard is ITransactionGuard, IModuleGuard {
    address public immutable SEQUENCE_EXECUTOR;

    error BravaGuard_InvalidAddress();
    error BravaGuard_TransactionNotAllowed();

    constructor(address _sequenceExecutor) {
        require(_sequenceExecutor != address(0), BravaGuard_InvalidAddress());
        SEQUENCE_EXECUTOR = _sequenceExecutor;
    }

    /// @dev Validates if a transaction is allowed to proceed
    /// @dev Reverts if the transaction is not targeting the sequence executor
    function validateTransaction(address to) private view {
        require(to == SEQUENCE_EXECUTOR, BravaGuard_TransactionNotAllowed());
    }

    function checkTransaction(
        address to,
        uint256,
        bytes memory,
        Enum.Operation,
        uint256,
        uint256,
        uint256,
        address,
        address payable,
        bytes memory,
        address
    ) external view override {
        validateTransaction(to);
    }

    // solhint-disable-next-line no-empty-blocks
    function checkAfterExecution(bytes32, bool) external pure override {}

    function checkModuleTransaction(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        address module
    ) external view override returns (bytes32) {
        validateTransaction(to);
        return keccak256(abi.encode(to, value, keccak256(data), operation, module));
    }

    // solhint-disable-next-line no-empty-blocks
    function checkAfterModuleExecution(bytes32, bool) external pure override {}

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(ITransactionGuard).interfaceId || // 0xe6d7a83a
            interfaceId == type(IModuleGuard).interfaceId || // 0x58401ed8
            interfaceId == type(IERC165).interfaceId; // 0x01ffc9a7
    }
}
