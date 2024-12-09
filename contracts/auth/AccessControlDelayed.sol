// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Errors} from "../Errors.sol";
import {ILogger} from "../interfaces/ILogger.sol";
import {Roles} from "./Roles.sol";

/// @title Add delays to granting roles in access control
/// @dev We should intercept calls to grantRole and implement a proposal system
///      to allow for a delay to pass before the role is granted.
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
abstract contract AccessControlDelayed is AccessControl, Roles {
    /// @notice The maximum delay for a role proposal, to avoid costly mistakes
    uint256 public constant MAX_DELAY = 5 days;

    ILogger public immutable LOGGER;

    /// @notice The delay period for any proposals in the system
    uint256 public delay;
    /// @notice The new delay to be set after delayReductionLockTime
    uint256 public proposedDelay;
    /// @notice The time when the new delay can be set/used
    uint256 public delayReductionLockTime;

    /// @notice mapping of proposed roles to the timestamp they can be granted
    mapping(bytes32 => uint256) public proposedRoles;

    constructor(uint256 _delay, address _logger) {
        delay = _delay;
        LOGGER = ILogger(_logger);
    }

    /// @notice Proposes a role with a delay
    /// @dev We must check that the account is not the zero address and that the role is not already granted or proposed
    function proposeRole(bytes32 role, address account) external onlyRole(OWNER_ROLE) {
        require(account != address(0), Errors.InvalidInput("AccessControlDelayed", "_proposeRole"));
        require(!hasRole(role, account), Errors.AdminVault_AlreadyGranted());
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        require(proposedRoles[proposalId] == 0, Errors.AdminVault_AlreadyProposed());

        // add to list of proposed roles with the wait time
        proposedRoles[proposalId] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(104, abi.encode(role, account));
    }

    /// @notice Grants a role after the delay has passed
    /// @dev We must check that the role was proposed and the delay has passed
    function grantRole(bytes32 role, address account) public override(AccessControl) {
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        require(proposedRoles[proposalId] != 0, Errors.AdminVault_NotProposed());
        require(
            block.timestamp >= proposedRoles[proposalId],
            Errors.AdminVault_DelayNotPassed(block.timestamp, proposedRoles[proposalId])
        );

        // Role was proposed and delay has passed. Now delete proposal and grant role
        delete proposedRoles[proposalId];
        super.grantRole(role, account);
        /// @dev AccessControl will silently execute if the role is already granted
        ///      this doesn't happen here because we checked when the proposal was made
        ///      and revoking the role will also clear proposals.
        ///      So to grant any role, it MUST have been proposed and not already granted.
        LOGGER.logAdminVaultEvent(204, abi.encode(role, account));
    }

    /// @notice Cancels a role proposal
    /// @dev We must check that the proposal exists
    function cancelRoleProposal(bytes32 role, address account) external onlyRole(ROLE_CANCELER_ROLE) {
        require(proposedRoles[keccak256(abi.encodePacked(role, account))] != 0, Errors.AdminVault_NotProposed());
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
        LOGGER.logAdminVaultEvent(304, abi.encode(role, account));
    }

    /// @notice Revokes a role from the given account
    /// @dev We must check that the account has the role, and also remove any proposals
    function revokeRole(bytes32 role, address account) public override(AccessControl) {
        require(hasRole(role, account), Errors.AdminVault_NotGranted());
        super.revokeRole(role, account);
        // no need to check if the proposal exists, we're just setting it to 0
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
        LOGGER.logAdminVaultEvent(404, abi.encode(role, account));
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
        LOGGER.logAdminVaultEvent(400, abi.encode(delay, _newDelay));
        if (_newDelay >= delay) {
            // New delay is longer, just set it
            delay = _newDelay;
        } else {
            // New delay is shorter, enforce old delay until it is met
            delayReductionLockTime = block.timestamp + delay;
            proposedDelay = _newDelay;
        }
    }

    /// @notice Returns the timestamp to wait until,
    /// @dev Factors in the the delayReductionLockTime
    /// @dev If after the lock time we can set delay to the new value
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

    /// @notice Checks if the proposal has passed the wait time
    /// @return True if the proposal has passed the wait time
    function _checkProposalWaitTime(bytes32 proposalId) internal view returns (bool) {
        return block.timestamp >= proposedRoles[proposalId];
    }
}
