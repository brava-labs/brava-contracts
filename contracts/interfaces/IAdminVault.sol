// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

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

    // Structs
    struct FeeConfig {
        address recipient;
        uint256 minBasis;
        uint256 maxBasis;
        uint256 proposalTime;
    }

    // View Functions
    // solhint-disable-next-line func-name-mixedcase
    function LOGGER() external view returns (address);
    // solhint-disable-next-line func-name-mixedcase
    function OWNER_ROLE() external view returns (bytes32);
    // solhint-disable-next-line func-name-mixedcase
    function ADMIN_ROLE() external view returns (bytes32);
    function feeConfig() external view returns (FeeConfig memory);
    function pendingFeeConfig() external view returns (FeeConfig memory);
    function lastFeeTimestamp(address, address) external view returns (uint256);
    function protocolPools(uint256 protocolId, bytes4 poolId) external view returns (address);
    function actionAddresses(bytes4 actionId) external view returns (address);
    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address);
    function getActionAddress(bytes4 _actionId) external view returns (address);
    function getLastFeeTimestamp(address _vault) external view returns (uint256);
    function checkFeeBasis(uint256 _feeBasis) external view;
    function getPoolProposalTime(string calldata protocolName, address poolAddress) external view returns (uint256);
    function getActionProposalTime(bytes4 actionId, address actionAddress) external view returns (uint256);

    // Role Management Functions
    function hasRole(bytes32 role, address account) external view returns (bool);
    function getRoleAdmin(bytes32 role) external view returns (bytes32);
    function grantRole(bytes32 role, address account) external;
    function revokeRole(bytes32 role, address account) external;
    function renounceRole(bytes32 role, address callerConfirmation) external;

    // Fee Management Functions
    function proposeFeeConfig(address recipient, uint256 min, uint256 max) external;
    function cancelFeeConfigProposal() external;
    function setFeeConfig() external;
    function setFeeTimestamp(address _vault) external;

    // Pool Management Functions
    function proposePool(string calldata protocolName, address poolAddress) external;
    function cancelPoolProposal(string calldata protocolName, address poolAddress) external;
    function addPool(string calldata protocolName, address poolAddress) external;
    function removePool(string calldata protocolName, address poolAddress) external;

    // Action Management Functions
    function proposeAction(bytes4 actionId, address actionAddress) external;
    function cancelActionProposal(bytes4 actionId, address actionAddress) external;
    function addAction(bytes4 actionId, address actionAddress) external;
    function removeAction(bytes4 actionId) external;

    // Transaction Management Functions
    function proposeTransaction(bytes32 txHash) external;
    function cancelTransactionProposal(bytes32 txHash) external;
    function approveTransaction(bytes32 txHash) external;
    function revokeTransaction(bytes32 txHash) external;
    function isApprovedTransaction(bytes32 txHash) external view returns (bool);

    // Delay Management Functions
    function getDelayTimestamp() external returns (uint256);
}
