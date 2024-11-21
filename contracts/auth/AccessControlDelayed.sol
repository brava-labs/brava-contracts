// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Errors} from "../Errors.sol";
import {Roles} from "./Roles.sol";

/// @title Add delays to granting roles in access control
abstract contract AccessControlDelayed is AccessControl, Roles {
    // TODO: Should these be in the logger?
    event RoleProposed(bytes32 indexed role, address indexed account, uint256 timestamp);
    event RoleProposalCancelled(bytes32 indexed role, address indexed account);
    event DelayChanged(uint256 oldDelay, uint256 newDelay);

    /// @notice The maximum delay for a role proposal, to avoid costly mistakes
    uint256 public constant MAX_DELAY = 5 days;

    uint256 public delay; // How long after a proposal can the role be granted
    uint256 public proposedDelay; // New delay to be set after delayReductionLockTime
    uint256 public delayReductionLockTime; // Time when the new delay can be set/used
    // mapping of proposed roles to the timestamp they can be granted
    mapping(bytes32 => uint256) public proposedRoles;

    constructor(uint256 _delay) {
        delay = _delay;
    }

    // TODO: test multicall works here, then we can delete this
    function grantRoles(bytes32[] calldata roles, address[] calldata accounts) external {
        for (uint256 i = 0; i < roles.length; i++) {
            grantRole(roles[i], accounts[i]);
        }
    }

    function grantRole(bytes32 role, address account) public override(AccessControl) {
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        require(proposedRoles[proposalId] != 0, Errors.AdminVault_NotProposed());
        require(
            block.timestamp >= proposedRoles[proposalId],
            Errors.AdminVault_DelayNotPassed(block.timestamp, proposedRoles[proposalId])
        );

        // role was proposed and delay has passed, delete proposal and grant role
        delete proposedRoles[proposalId];
        super.grantRole(role, account);
    }

    // TODO: test multicall works here, then we can delete this
    function proposeRoles(bytes32[] calldata roles, address[] calldata accounts) external onlyRole(OWNER_ROLE) {
        for (uint256 i = 0; i < roles.length; i++) {
            _proposeRole(roles[i], accounts[i]);
        }
    }

    function proposeRole(bytes32 role, address account) external onlyRole(OWNER_ROLE) {
        _proposeRole(role, account);
    }

    function _proposeRole(bytes32 role, address account) internal {
        require(account != address(0), Errors.InvalidInput("AccessControlDelayed", "_proposeRole"));
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        require(proposedRoles[proposalId] == 0, Errors.AdminVault_AlreadyProposed());

        // add to list of proposed roles with the wait time
        proposedRoles[proposalId] = _getDelayTimestamp();
        emit RoleProposed(role, account, proposedRoles[proposalId]);
    }

    // A helper to find the time when a role proposal will be available to grant
    function getRoleProposalTime(bytes32 role, address account) public view returns (uint256) {
        return proposedRoles[keccak256(abi.encodePacked(role, account))];
    }

    /* Admin function to change the delay
        If the new delay is longer we just use it.
        If the new delay is shorter we must set a timestamp for when the old delay
        would have expired and we can use the new delay after that time.
        e.g. If the delay is 2 hours, and we reduce it to 1 hour. All new proposals
            must wait until at least now + 2 hours (old delay) but in 1 hour's time
            they may start using the new delay (because both the old and the new
            delays will have passed by the time they may be granted).
        Note: We don't simply add the shorter delay to the delayReductionLockTime
            because for legitimate use we may want to shorten the delay, say from
            2 days to 1 day, in this case we don't want to wait a total of 3 days.
        This means that the delay used by default should include enough time to:
        -- Notice the change
        -- Deal with the security hole (remove attackers permissions)
        -- Adjust the delay back to a suitable value
        -- Cancel any proposals made during this period
    */
    function changeDelay(uint256 _newDelay) public onlyRole(OWNER_ROLE) {
        // (_newDelay must be different from delay OR there must be a proposal to cancel)
        //  AND _newDelay must not more than 5 days (to avoid costly mistakes)
        require(
            (_newDelay != delay || proposedDelay == 0) && _newDelay <= MAX_DELAY,
            Errors.AccessControlDelayed_InvalidDelay()
        );

        if (block.timestamp < delayReductionLockTime) {
            // The delay must already have been reduced because delayReductionLockTime is in the future
            // We can't have set the delay to proposedDelay yet, so we can just delete it
            delete delayReductionLockTime;
            delete proposedDelay;
        }
        emit DelayChanged(delay, _newDelay);
        if (_newDelay >= delay) {
            // New delay is longer, just set it
            delay = _newDelay;
        } else {
            // New delay is shorter, enforce old delay until it is met
            delayReductionLockTime = block.timestamp + delay;
            proposedDelay = _newDelay;
        }
    }

    // an internal function that will return the timestamp to wait until,
    // factors in the the delayReductionLockTime
    // if after the lock time we can set delay to the new value
    function _getDelayTimestamp() internal returns (uint256) {
        if (block.timestamp < delayReductionLockTime) {
            // We haven't reached the lock time yet,
            // We must wait until the greater of the lock time, or now + proposedDelay
            uint256 proposedDelayTime = block.timestamp + proposedDelay;
            return proposedDelayTime > delayReductionLockTime ? proposedDelayTime : delayReductionLockTime;
        }
        // We have reached the lock time, we may set the delay to the proposed delay
        if (proposedDelay != 0) {
            delay = proposedDelay;
            delete proposedDelay;
        }
        return block.timestamp + delay;
    }

    function _checkProposalWaitTime(bytes32 proposalId) internal view returns (bool) {
        return block.timestamp >= proposedRoles[proposalId];
    }

    function cancelRoleProposal(bytes32 role, address account) external onlyRole(ROLE_CANCELER_ROLE) {
        require(proposedRoles[keccak256(abi.encodePacked(role, account))] != 0, Errors.AdminVault_NotProposed());
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
        emit RoleProposalCancelled(role, account);
    }
}
