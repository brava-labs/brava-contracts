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
}