// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

/**
 * @title IMaplePoolManager
 * @dev Interface for Maple Finance Pool Manager contracts
 */
interface IMaplePoolManager {
    /**
     * @notice Get the address of the withdrawal manager for this pool
     * @return The withdrawal manager address
     */
    function withdrawalManager() external view returns (address);
    
    /**
     * @notice Get the pool address managed by this manager
     * @return The pool address
     */
    function pool() external view returns (address);

    /**
     * @notice Get the pool delegate for this pool
     * @return The pool delegate address
     */
    function poolDelegate() external view returns (address);
} 