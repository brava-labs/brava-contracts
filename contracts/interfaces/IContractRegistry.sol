// SPDX-License-Identifier: MIT

pragma solidity =0.8.28;

/// @title Stores all the important contract addresses used throughout the system.
/// @notice Contract addresses can be changed by the owner with a timelock.
interface IContractRegistry {
    /// @notice Given an contract id returns the registered address
    /// @dev Id is keccak256 of the contract name
    /// @param _id Id of contract
    function getAddr(bytes4 _id) external view returns (address);

    /// @notice Helper function to easily query if id is registered
    /// @param _id Id of contract
    function isRegistered(bytes4 _id) external view returns (bool);
}
