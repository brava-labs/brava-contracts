// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAdminVault {
    // Errors
    error SenderNotAdmin();
    error SenderNotOwner();
    error FeeTimestampNotInitialized();
    error FeeTimestampAlreadyInitialized();
    error FeePercentageOutOfRange();
    error InvalidRange();
    error InvalidRecipient();
    error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);
    error AccessControlBadConfirmation();

    // State Variables
    function minFeeBasis() external view returns (uint256);
    function maxFeeBasis() external view returns (uint256);
    function feeRecipient() external view returns (address);
    function lastFeeTimestamp(address, address) external view returns (uint256);

    // Functions
    function setFeeRange(uint256 _min, uint256 _max) external;
    function setFeeRecipient(address _recipient) external;
    function initializeFeeTimestamp(address _vault) external;
    function updateFeeTimestamp(address _vault) external;
    function getLastFeeTimestamp(address _vault) external view returns (uint256);
    function checkFeeBasis(uint256 _feeBasis) external view;
    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address);
    function getActionAddress(bytes4 _actionId) external view returns (address);
    function hasRole(bytes32 role, address account) external view returns (bool);
    function getRoleAdmin(bytes32 role) external view returns (bytes32);
    function grantRole(bytes32 role, address account) external;
    function revokeRole(bytes32 role, address account) external;
    function renounceRole(bytes32 role, address callerConfirmation) external;

}