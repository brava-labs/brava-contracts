// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

/// @title A stateful contract that holds and can change owner/admin
contract AdminVault {
    error SenderNotAdmin();
    error SenderNotOwner();
    error FeeTimestampNotInitialized();
    error FeeTimestampAlreadyInitialized();
    error FeePercentageOutOfRange();
    error InvalidRange();
    error InvalidRecipient();

    address public owner;
    address public admin;
    uint256 public minFeeBasis;
    uint256 public maxFeeBasis;
    address public feeRecipient;
    // mapping of when a particular safe had fees taken from a particular vault
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    /// TODO: Should we add events for all the setters?

    constructor(address _owner, address _admin) {
        owner = _owner;
        admin = _admin;

        // putting some default values here
        // TODO: these should be added to the deployment script later
        minFeeBasis = 0;
        maxFeeBasis = 10000; // 100%
        feeRecipient = _owner;
    }

    /// @notice Only owner is able to change owner
    /// @param _owner Address of new owner
    function changeOwner(address _owner) external {
        if (owner != msg.sender) {
            revert SenderNotOwner();
        }
        owner = _owner;
    }

    /// @notice Owner or admin is able to set new admin
    /// @param _admin Address of multisig that becomes new admin
    function changeAdmin(address _admin) external {
        if (msg.sender == owner) {
            admin = _admin;
        } else if (msg.sender == admin) {
            admin = _admin;
        } else {
            revert SenderNotAdmin();
        }
    }

    function setFeeRange(uint256 _min, uint256 _max) external {
        if (msg.sender != owner && msg.sender != admin) {
            revert SenderNotAdmin();
        }
        if (_min > _max) {
            revert InvalidRange();
        }
        minFeeBasis = _min;
        maxFeeBasis = _max;
    }

    function setFeeRecipient(address _recipient) external {
        if (msg.sender != owner) {
            revert SenderNotOwner();
        }
        if (_recipient == address(0)) {
            revert InvalidRecipient();
        }
        feeRecipient = _recipient;
    }

    // called by an action when a user changes their deposit from zero to non-zero
    // TODO: Add a guard to block attackers from calling this, given access to a mapping they can write to storage of their choice
    function initializeFeeTimestamp(address _vault) external {
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    // called by the safe when a fee is taken
    function updateFeeTimestamp(address _vault) external {
        assert(lastFeeTimestamp[msg.sender][_vault] != 0);
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    // View functions

    function getLastFeeTimestamp(address _vault) external view returns (uint256) {
        assert(lastFeeTimestamp[msg.sender][_vault] != 0);
        return lastFeeTimestamp[msg.sender][_vault];
    }

    function checkFeeBasis(uint256 _feeBasis) external view {
        if (_feeBasis < minFeeBasis || _feeBasis > maxFeeBasis) {
            revert FeePercentageOutOfRange();
        }
    }
}
