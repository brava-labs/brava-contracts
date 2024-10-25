// Sources flattened with hardhat v2.22.10 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/access/IAccessControl.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/IAccessControl.sol)

pragma solidity ^0.8.20;

/**
 * @dev External interface of AccessControl declared to support ERC165 detection.
 */
interface IAccessControl {
    /**
     * @dev The `account` is missing a role.
     */
    error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);

    /**
     * @dev The caller of a function is not the expected one.
     *
     * NOTE: Don't confuse with {AccessControlUnauthorizedAccount}.
     */
    error AccessControlBadConfirmation();

    /**
     * @dev Emitted when `newAdminRole` is set as ``role``'s admin role, replacing `previousAdminRole`
     *
     * `DEFAULT_ADMIN_ROLE` is the starting admin for all roles, despite
     * {RoleAdminChanged} not being emitted signaling this.
     */
    event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole);

    /**
     * @dev Emitted when `account` is granted `role`.
     *
     * `sender` is the account that originated the contract call, an admin role
     * bearer except when using {AccessControl-_setupRole}.
     */
    event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Emitted when `account` is revoked `role`.
     *
     * `sender` is the account that originated the contract call:
     *   - if using `revokeRole`, it is the admin role bearer
     *   - if using `renounceRole`, it is the role bearer (i.e. `account`)
     */
    event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender);

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) external view returns (bool);

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {AccessControl-_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) external view returns (bytes32);

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function grantRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     */
    function revokeRole(bytes32 role, address account) external;

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been granted `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     */
    function renounceRole(bytes32 role, address callerConfirmation) external;
}


// File @openzeppelin/contracts/utils/Context.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

pragma solidity ^0.8.20;

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}


// File @openzeppelin/contracts/utils/introspection/IERC165.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/introspection/IERC165.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[EIP].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}


// File @openzeppelin/contracts/utils/introspection/ERC165.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/introspection/ERC165.sol)

pragma solidity ^0.8.20;

/**
 * @dev Implementation of the {IERC165} interface.
 *
 * Contracts that want to implement ERC165 should inherit from this contract and override {supportsInterface} to check
 * for the additional interface id that will be supported. For example:
 *
 * ```solidity
 * function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
 *     return interfaceId == type(MyInterface).interfaceId || super.supportsInterface(interfaceId);
 * }
 * ```
 */
abstract contract ERC165 is IERC165 {
    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
        return interfaceId == type(IERC165).interfaceId;
    }
}


// File @openzeppelin/contracts/access/AccessControl.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (access/AccessControl.sol)

pragma solidity ^0.8.20;



/**
 * @dev Contract module that allows children to implement role-based access
 * control mechanisms. This is a lightweight version that doesn't allow enumerating role
 * members except through off-chain means by accessing the contract event logs. Some
 * applications may benefit from on-chain enumerability, for those cases see
 * {AccessControlEnumerable}.
 *
 * Roles are referred to by their `bytes32` identifier. These should be exposed
 * in the external API and be unique. The best way to achieve this is by
 * using `public constant` hash digests:
 *
 * ```solidity
 * bytes32 public constant MY_ROLE = keccak256("MY_ROLE");
 * ```
 *
 * Roles can be used to represent a set of permissions. To restrict access to a
 * function call, use {hasRole}:
 *
 * ```solidity
 * function foo() public {
 *     require(hasRole(MY_ROLE, msg.sender));
 *     ...
 * }
 * ```
 *
 * Roles can be granted and revoked dynamically via the {grantRole} and
 * {revokeRole} functions. Each role has an associated admin role, and only
 * accounts that have a role's admin role can call {grantRole} and {revokeRole}.
 *
 * By default, the admin role for all roles is `DEFAULT_ADMIN_ROLE`, which means
 * that only accounts with this role will be able to grant or revoke other
 * roles. More complex role relationships can be created by using
 * {_setRoleAdmin}.
 *
 * WARNING: The `DEFAULT_ADMIN_ROLE` is also its own admin: it has permission to
 * grant and revoke this role. Extra precautions should be taken to secure
 * accounts that have been granted it. We recommend using {AccessControlDefaultAdminRules}
 * to enforce additional security measures for this role.
 */
abstract contract AccessControl is Context, IAccessControl, ERC165 {
    struct RoleData {
        mapping(address account => bool) hasRole;
        bytes32 adminRole;
    }

    mapping(bytes32 role => RoleData) private _roles;

    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    /**
     * @dev Modifier that checks that an account has a specific role. Reverts
     * with an {AccessControlUnauthorizedAccount} error including the required role.
     */
    modifier onlyRole(bytes32 role) {
        _checkRole(role);
        _;
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccessControl).interfaceId || super.supportsInterface(interfaceId);
    }

    /**
     * @dev Returns `true` if `account` has been granted `role`.
     */
    function hasRole(bytes32 role, address account) public view virtual returns (bool) {
        return _roles[role].hasRole[account];
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `_msgSender()`
     * is missing `role`. Overriding this function changes the behavior of the {onlyRole} modifier.
     */
    function _checkRole(bytes32 role) internal view virtual {
        _checkRole(role, _msgSender());
    }

    /**
     * @dev Reverts with an {AccessControlUnauthorizedAccount} error if `account`
     * is missing `role`.
     */
    function _checkRole(bytes32 role, address account) internal view virtual {
        if (!hasRole(role, account)) {
            revert AccessControlUnauthorizedAccount(account, role);
        }
    }

    /**
     * @dev Returns the admin role that controls `role`. See {grantRole} and
     * {revokeRole}.
     *
     * To change a role's admin, use {_setRoleAdmin}.
     */
    function getRoleAdmin(bytes32 role) public view virtual returns (bytes32) {
        return _roles[role].adminRole;
    }

    /**
     * @dev Grants `role` to `account`.
     *
     * If `account` had not been already granted `role`, emits a {RoleGranted}
     * event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleGranted} event.
     */
    function grantRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _grantRole(role, account);
    }

    /**
     * @dev Revokes `role` from `account`.
     *
     * If `account` had been granted `role`, emits a {RoleRevoked} event.
     *
     * Requirements:
     *
     * - the caller must have ``role``'s admin role.
     *
     * May emit a {RoleRevoked} event.
     */
    function revokeRole(bytes32 role, address account) public virtual onlyRole(getRoleAdmin(role)) {
        _revokeRole(role, account);
    }

    /**
     * @dev Revokes `role` from the calling account.
     *
     * Roles are often managed via {grantRole} and {revokeRole}: this function's
     * purpose is to provide a mechanism for accounts to lose their privileges
     * if they are compromised (such as when a trusted device is misplaced).
     *
     * If the calling account had been revoked `role`, emits a {RoleRevoked}
     * event.
     *
     * Requirements:
     *
     * - the caller must be `callerConfirmation`.
     *
     * May emit a {RoleRevoked} event.
     */
    function renounceRole(bytes32 role, address callerConfirmation) public virtual {
        if (callerConfirmation != _msgSender()) {
            revert AccessControlBadConfirmation();
        }

        _revokeRole(role, callerConfirmation);
    }

    /**
     * @dev Sets `adminRole` as ``role``'s admin role.
     *
     * Emits a {RoleAdminChanged} event.
     */
    function _setRoleAdmin(bytes32 role, bytes32 adminRole) internal virtual {
        bytes32 previousAdminRole = getRoleAdmin(role);
        _roles[role].adminRole = adminRole;
        emit RoleAdminChanged(role, previousAdminRole, adminRole);
    }

    /**
     * @dev Attempts to grant `role` to `account` and returns a boolean indicating if `role` was granted.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleGranted} event.
     */
    function _grantRole(bytes32 role, address account) internal virtual returns (bool) {
        if (!hasRole(role, account)) {
            _roles[role].hasRole[account] = true;
            emit RoleGranted(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }

    /**
     * @dev Attempts to revoke `role` to `account` and returns a boolean indicating if `role` was revoked.
     *
     * Internal function without access restriction.
     *
     * May emit a {RoleRevoked} event.
     */
    function _revokeRole(bytes32 role, address account) internal virtual returns (bool) {
        if (hasRole(role, account)) {
            _roles[role].hasRole[account] = false;
            emit RoleRevoked(role, account, _msgSender());
            return true;
        } else {
            return false;
        }
    }
}


// File contracts/Errors.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity =0.8.24;

/// @title Errors
/// @notice This contract contains all custom errors used across the protocol
contract Errors {
    // Generic errors
    error InvalidInput(string _contract, string _function);

    // AccessControlDelayed errors
    error AccessControlDelayed_InvalidDelay();

    // AdminVault errors
    error AdminVault_FeePercentageOutOfRange(uint256 _providedPercentage, uint256 _minAllowed, uint256 _maxAllowed);
    error AdminVault_InvalidFeeRange(uint256 _minFee, uint256 _maxFee);
    error AdminVault_AlreadyInitialized();
    error AdminVault_NotInitialized();
    error AdminVault_Unauthorized(address _caller, bytes32 _requiredRole);
    error AdminVault_DelayNotPassed(uint256 _currentTime, uint256 _requiredTime);
    error AdminVault_NotFound(string _entityType, bytes4 _entityId);
    error AdminVault_NotProposed();
    error AdminVault_AlreadyProposed();
    error AdminVault_NotAdded();
    error AdminVault_AlreadyAdded();

    // FeeTakeSafeModule errors
    error FeeTakeSafeModule_SenderNotFeeTaker(address _sender);
    error FeeTakeSafeModule_InvalidActionType(bytes4 _actionId);
    error FeeTakeSafeModule_ExecutionFailed();

    // Generic Action errors
    error Action_ZeroAmount(string _protocolName, uint8 _actionType);
    error Action_InsufficientSharesReceived(
        string _protocolName,
        uint8 _actionType,
        uint256 _sharesReceived,
        uint256 _minSharesReceived
    );
    error Action_MaxSharesBurnedExceeded(
        string _protocolName,
        uint8 _actionType,
        uint256 _sharesBurned,
        uint256 _maxAllowed
    );
    error Action_NotDelegateCall();
    // Curve3PoolSwap errors
    error Curve3Pool__InvalidTokenIndices(int128 _fromToken, int128 _toToken);

    // SendToken errors
    error Action_InvalidRecipient(string _protocolName, uint8 _actionType);
}


// File contracts/auth/AccessControlDelayed.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity =0.8.24;


/// @title Add delays to granting roles in access control
abstract contract AccessControlDelayed is AccessControl {
    uint256 public delay; // How long after a proposal can the role be granted
    uint256 public proposedDelay; // New delay to be set after delayReductionLockTime
    uint256 public delayReductionLockTime; // Time when the new delay can be set/used
    // mapping of proposed roles to the timestamp they can be granted
    mapping(bytes32 => uint256) public proposedRoles;

    constructor(uint256 _delay) {
        delay = _delay;
    }

    function grantRoles(bytes32[] calldata roles, address[] calldata accounts) external virtual {
        for (uint256 i = 0; i < roles.length; i++) {
            grantRole(roles[i], accounts[i]);
        }
    }

    function grantRole(bytes32 role, address account) public virtual override(AccessControl) {
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        // Check if role was proposed
        if (proposedRoles[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        // Check if delay is passed
        if (block.timestamp < proposedRoles[proposalId]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, proposedRoles[proposalId]);
        }
        // role was proposed and delay has passed, delete proposal and grant role
        delete proposedRoles[proposalId];
        super.grantRole(role, account);
    }

    function proposeRoles(
        bytes32[] calldata roles,
        address[] calldata accounts
    ) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < roles.length; i++) {
            _proposeRole(roles[i], accounts[i]);
        }
    }

    function proposeRole(bytes32 role, address account) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        _proposeRole(role, account);
    }

    function _proposeRole(bytes32 role, address account) internal virtual {
        if (account == address(0)) {
            revert Errors.InvalidInput("AccessControlDelayed", "_proposeRole");
        }
        // Check if role was already proposed
        bytes32 proposalId = keccak256(abi.encodePacked(role, account));
        if (proposedRoles[proposalId] > 0) {
            revert Errors.AdminVault_AlreadyProposed();
        }
        // add to list of proposed roles with the wait time
        proposedRoles[proposalId] = _getDelayTimestamp();
    }

    // A helper to find the time when a role proposal will be available to grant
    function getRoleProposalTime(bytes32 role, address account) public view returns (uint256) {
        return proposedRoles[keccak256(abi.encodePacked(role, account))];
    }

    // Admin function to change the delay
    // If the new delay is longer we just use it.
    // If the new delay is shorter we must set a timestamp for when the old delay
    // would have expired and we can use the new delay after that time.
    // e.g. If the delay is 2 hours, and we reduce it to 1 hour. All new proposals
    //      must wait until at least now + 2 hours (old delay) but in 1 hour's time
    //      they may start using the new delay (because both the old and the new
    //      delays will have passed by the time they may be granted).
    // Note: We don't simply add the shorter delay to the delayReductionLockTime
    //       because for legitimate use we may want to shorten the delay, say from
    //       2 days to 1 day, in this case we don't want to wait a total of 3 days.
    // This means that the delay used by default should include enough time to:
    //   -- Notice the change
    //   -- Deal with the security hole (remove attackers permissions)
    //   -- Adjust the delay back to a suitable value
    //   -- Cancel any proposals made during this period
    function changeDelay(uint256 _newDelay) public onlyRole(DEFAULT_ADMIN_ROLE) {
        // Only overwrite the same delay if there is a proposal we want to cancel
        // Delay must not more than 5 days (to avoid costly mistakes)
        if ((_newDelay == delay && proposedDelay != 0) || _newDelay > 5 days) {
            revert Errors.AccessControlDelayed_InvalidDelay();
        }

        if (block.timestamp < delayReductionLockTime) {
            // The delay must already have been reduced because delayReductionLockTime is in the future
            // We can't have set the delay to proposedDelay yet, so we can just delete it
            delete delayReductionLockTime;
            delete proposedDelay;
        }

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
    // foctors in the the delayReuctionLockTime
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

    function cancelRoleProposal(bytes32 role, address account) external virtual onlyRole(DEFAULT_ADMIN_ROLE) {
        if (proposedRoles[keccak256(abi.encodePacked(role, account))] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        delete proposedRoles[keccak256(abi.encodePacked(role, account))];
    }
}


// File contracts/interfaces/ILogger.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity =0.8.24;

interface ILogger {
    event ActionEvent(address indexed caller, uint256 indexed logId, bytes data);
    event AdminVaultEvent(uint256 indexed logId, bytes data);

    function logActionEvent(uint256 _logId, bytes memory _data) external;
    function logAdminVaultEvent(uint256 _logId, bytes memory _data) external;
}


// File contracts/auth/AdminVault.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity =0.8.24;



/// @title AdminVault
/// @notice A stateful contract that manages global variables and permissions for the protocol.
/// @dev This contract handles fee management, pool and action registrations, and role-based access control.
contract AdminVault is AccessControlDelayed {
    ILogger public immutable LOGGER;

    // Role definitions
    bytes32 public constant OWNER_ROLE = keccak256("OWNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Granular role definitions
    bytes32 public constant FEE_PROPOSER_ROLE = keccak256("FEE_PROPOSER_ROLE");
    bytes32 public constant FEE_EXECUTOR_ROLE = keccak256("FEE_EXECUTOR_ROLE");
    bytes32 public constant POOL_PROPOSER_ROLE = keccak256("POOL_PROPOSER_ROLE");
    bytes32 public constant POOL_EXECUTOR_ROLE = keccak256("POOL_EXECUTOR_ROLE");
    bytes32 public constant ACTION_PROPOSER_ROLE = keccak256("ACTION_PROPOSER_ROLE");
    bytes32 public constant ACTION_EXECUTOR_ROLE = keccak256("ACTION_EXECUTOR_ROLE");

    // Timestamp tracking for fee collection: user => vault => timestamp
    mapping(address => mapping(address => uint256)) public lastFeeTimestamp;

    // TODO improve mapping ID
    // Protocol and pool management: protocol => poolId => poolAddress
    mapping(uint256 => mapping(bytes4 => address)) public protocolPools;

    // Proposal tracking: proposalId => timestamp
    mapping(bytes32 => uint256) public poolProposals;
    mapping(bytes32 => uint256) public actionProposals;
    // Fee configuration structure
    struct FeeConfig {
        address recipient;
        uint256 minBasis;
        uint256 maxBasis;
        uint256 proposalTime; // Used only for proposals, 0 for active config
    }
    // Current active fee configuration
    FeeConfig public feeConfig;
    // Pending fee configuration proposal
    FeeConfig public pendingFeeConfig;

    // Action management: actionId => actionAddress
    mapping(bytes4 => address) public actionAddresses;

    /// @notice Initializes the AdminVault with an initial owner and delay period.
    /// @param _initialOwner The address to be granted all initial roles.
    /// @param _delay The required delay period for proposals (in seconds).
    /// @param _logger The address of the Logger contract.
    constructor(address _initialOwner, uint256 _delay, address _logger) AccessControlDelayed(_delay) {
        if (_initialOwner == address(0) || _logger == address(0)) {
            revert Errors.InvalidInput("AdminVault", "constructor");
        }

        LOGGER = ILogger(_logger);

        // Set initial fee configuration
        feeConfig = FeeConfig({
            recipient: _initialOwner,
            minBasis: 0,
            maxBasis: 1000, // 10% in basis points
            proposalTime: 0
        });

        _grantRole(DEFAULT_ADMIN_ROLE, _initialOwner);
        _grantRole(OWNER_ROLE, _initialOwner);
        _grantRole(ADMIN_ROLE, _initialOwner);

        // Grant all granular roles to initial owner
        _grantRole(FEE_PROPOSER_ROLE, _initialOwner);
        _grantRole(FEE_EXECUTOR_ROLE, _initialOwner);
        _grantRole(POOL_PROPOSER_ROLE, _initialOwner);
        _grantRole(POOL_EXECUTOR_ROLE, _initialOwner);
        _grantRole(ACTION_PROPOSER_ROLE, _initialOwner);
        _grantRole(ACTION_EXECUTOR_ROLE, _initialOwner);

        // Set role hierarchy
        _setRoleAdmin(OWNER_ROLE, OWNER_ROLE);
        _setRoleAdmin(ADMIN_ROLE, OWNER_ROLE);

        // Proposer roles managed by OWNER
        _setRoleAdmin(FEE_PROPOSER_ROLE, OWNER_ROLE);
        _setRoleAdmin(POOL_PROPOSER_ROLE, OWNER_ROLE);
        _setRoleAdmin(ACTION_PROPOSER_ROLE, OWNER_ROLE);

        // Executor roles managed by ADMIN
        _setRoleAdmin(FEE_EXECUTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(POOL_EXECUTOR_ROLE, ADMIN_ROLE);
        _setRoleAdmin(ACTION_EXECUTOR_ROLE, ADMIN_ROLE);
    }

    /// Fee management
    ///  - Propose
    ///  - Cancel
    ///  - Set

    /// @notice Proposes a new fee configuration including recipient and fee range
    /// @param _recipient The address of the proposed fee recipient
    /// @param _min The minimum fee in basis points
    /// @param _max The maximum fee in basis points
    function proposeFeeConfig(address _recipient, uint256 _min, uint256 _max) external onlyRole(FEE_PROPOSER_ROLE) {
        if (_recipient == address(0)) {
            revert Errors.InvalidInput("AdminVault", "proposeFeeConfig");
        }
        if (_max > 1000) {
            // 10% max
            revert Errors.AdminVault_FeePercentageOutOfRange(_max, 0, 1000);
        }
        if (_min >= _max) {
            revert Errors.AdminVault_InvalidFeeRange(_min, _max);
        }

        pendingFeeConfig = FeeConfig({
            recipient: _recipient,
            minBasis: _min,
            maxBasis: _max,
            proposalTime: _getDelayTimestamp()
        });

        LOGGER.logAdminVaultEvent(103, abi.encode(_recipient, _min, _max));
    }

    /// @notice Cancels the pending fee configuration proposal
    function cancelFeeConfigProposal() external onlyRole(FEE_PROPOSER_ROLE) {
        address recipient = pendingFeeConfig.recipient;
        uint256 min = pendingFeeConfig.minBasis;
        uint256 max = pendingFeeConfig.maxBasis;

        delete pendingFeeConfig;

        LOGGER.logAdminVaultEvent(303, abi.encode(recipient, min, max));
    }

    /// @notice Sets the pending fee configuration after the proposal delay has passed
    function setFeeConfig() external onlyRole(FEE_EXECUTOR_ROLE) {
        if (pendingFeeConfig.proposalTime == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < pendingFeeConfig.proposalTime) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, pendingFeeConfig.proposalTime);
        }

        // Store values for event logging
        address recipient = pendingFeeConfig.recipient;
        uint256 min = pendingFeeConfig.minBasis;
        uint256 max = pendingFeeConfig.maxBasis;

        // Update active config (note: proposalTime remains 0 for active config)
        feeConfig = FeeConfig({recipient: recipient, minBasis: min, maxBasis: max, proposalTime: 0});

        delete pendingFeeConfig;

        LOGGER.logAdminVaultEvent(203, abi.encode(recipient, min, max));
    }

    /// Pool management
    ///  - Propose
    ///  - Cancel
    ///  - Add
    ///  - Remove

    /// @notice Proposes a new pool for a protocol.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool.
    function proposePool(string calldata _protocolName, address _poolAddress) external onlyRole(POOL_PROPOSER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        if (protocolPools[protocolId][poolId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        poolProposals[proposalId] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(102, abi.encode(protocolId, _poolAddress));
    }

    /// @notice Cancels a pool proposal.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the proposed pool.
    function cancelPoolProposal(
        string calldata _protocolName,
        address _poolAddress
    ) external onlyRole(POOL_PROPOSER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        if (poolProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        poolProposals[proposalId] = 0;
        LOGGER.logAdminVaultEvent(302, abi.encode(protocolId, _poolAddress));
    }

    /// @notice Adds a new pool after the proposal delay has passed.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool to add.
    function addPool(string calldata _protocolName, address _poolAddress) external onlyRole(POOL_EXECUTOR_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        if (protocolPools[protocolId][poolId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        if (bytes(_protocolName).length == 0 || _poolAddress == address(0)) {
            revert Errors.InvalidInput("AdminVault", "addPool");
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        if (poolProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < poolProposals[proposalId]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, poolProposals[proposalId]);
        }
        protocolPools[protocolId][poolId] = _poolAddress;
        LOGGER.logAdminVaultEvent(202, abi.encode(protocolId, _poolAddress));
    }

    function removePool(string calldata _protocolName, address _poolAddress) external onlyRole(POOL_PROPOSER_ROLE) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        delete protocolPools[protocolId][poolId];
        LOGGER.logAdminVaultEvent(402, abi.encode(protocolId, _poolAddress));
    }

    /// Action management
    ///  - Propose
    ///  - Cancel
    ///  - Add
    ///  - Remove

    /// @notice Proposes a new action.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract.
    function proposeAction(bytes4 _actionId, address _actionAddress) external onlyRole(ACTION_PROPOSER_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        if (_actionAddress == address(0) || _actionId == bytes4(0)) {
            revert Errors.InvalidInput("AdminVault", "proposeAction");
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = _getDelayTimestamp();
        LOGGER.logAdminVaultEvent(101, abi.encode(_actionId, _actionAddress));
    }

    /// @notice Cancels an action proposal.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the proposed action contract.
    function cancelActionProposal(bytes4 _actionId, address _actionAddress) external onlyRole(ACTION_PROPOSER_ROLE) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        actionProposals[proposalId] = 0;
        LOGGER.logAdminVaultEvent(301, abi.encode(_actionId, _actionAddress));
    }

    /// @notice Adds a new action after the proposal delay has passed.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract to add.
    function addAction(bytes4 _actionId, address _actionAddress) external onlyRole(ACTION_EXECUTOR_ROLE) {
        if (actionAddresses[_actionId] != address(0)) {
            revert Errors.AdminVault_AlreadyAdded();
        }
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        if (actionProposals[proposalId] == 0) {
            revert Errors.AdminVault_NotProposed();
        }
        if (block.timestamp < actionProposals[proposalId]) {
            revert Errors.AdminVault_DelayNotPassed(block.timestamp, actionProposals[proposalId]);
        }
        actionAddresses[_actionId] = _actionAddress;
        LOGGER.logAdminVaultEvent(201, abi.encode(_actionId, _actionAddress));
    }

    function removeAction(bytes4 _actionId) external onlyRole(ACTION_PROPOSER_ROLE) {
        delete actionAddresses[_actionId];
        LOGGER.logAdminVaultEvent(401, abi.encode(_actionId));
    }

    /// Fee timestamp management
    ///  - Initialize
    ///  - Update

    /// @notice Initializes the fee timestamp for a vault.
    /// @dev This should be called when a user's deposit changes from zero to non-zero.
    /// @param _vault The address of the vault.
    /// @dev TODO: Add a guard to block attackers from calling this, given access to a mapping they can write to storage of their choice
    function initializeFeeTimestamp(address _vault) external {
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    /// @notice Updates the fee timestamp for a vault.
    /// @dev This should be called when a fee is taken.
    /// @param _vault The address of the vault.
    function updateFeeTimestamp(address _vault) external {
        lastFeeTimestamp[msg.sender][_vault] = block.timestamp;
    }

    /// Getters

    /// @notice Retrieves the address of a pool for a given protocol and pool ID.
    /// @param _protocolName The name of the protocol.
    /// @param _poolId The identifier of the pool.
    /// @return The address of the pool.
    function getPoolAddress(string calldata _protocolName, bytes4 _poolId) external view returns (address) {
        uint256 protocolId = uint256(keccak256(abi.encodePacked(_protocolName)));
        address poolAddress = protocolPools[protocolId][_poolId];
        if (poolAddress == address(0)) {
            revert Errors.AdminVault_NotFound(_protocolName, _poolId);
        }
        return poolAddress;
    }

    /// @notice Retrieves the address of an action for a given action ID.
    /// @param _actionId The identifier of the action.
    /// @return The address of the action contract.
    function getActionAddress(bytes4 _actionId) external view returns (address) {
        address actionAddress = actionAddresses[_actionId];
        if (actionAddress == address(0)) {
            revert Errors.AdminVault_NotFound("action", _actionId);
        }
        return actionAddress;
    }

    /// @notice Retrieves the last fee timestamp for a given vault.
    /// @param _vault The address of the vault.
    /// @return The last fee timestamp.
    function getLastFeeTimestamp(address _vault) external view returns (uint256) {
        if (lastFeeTimestamp[msg.sender][_vault] == 0) {
            revert Errors.AdminVault_NotInitialized();
        }
        return lastFeeTimestamp[msg.sender][_vault];
    }

    /// @notice Checks if a given fee basis is within the allowed range.
    /// @param _feeBasis The fee basis to check.
    function checkFeeBasis(uint256 _feeBasis) external view {
        if (_feeBasis < feeConfig.minBasis || _feeBasis > feeConfig.maxBasis) {
            revert Errors.AdminVault_FeePercentageOutOfRange(_feeBasis, feeConfig.minBasis, feeConfig.maxBasis);
        }
    }

    /// @notice Retrieves the proposal time for a given pool.
    /// @param _protocolName The name of the protocol.
    /// @param _poolAddress The address of the pool.
    /// @return The proposal timestamp.
    function getPoolProposalTime(string calldata _protocolName, address _poolAddress) external view returns (uint256) {
        bytes4 poolId = _poolIdFromAddress(_poolAddress);
        bytes32 proposalId = keccak256(abi.encodePacked(_protocolName, poolId, _poolAddress));
        return poolProposals[proposalId];
    }

    /// @notice Retrieves the proposal time for a given action.
    /// @param _actionId The identifier of the action.
    /// @param _actionAddress The address of the action contract.
    /// @return The proposal timestamp.
    function getActionProposalTime(bytes4 _actionId, address _actionAddress) external view returns (uint256) {
        bytes32 proposalId = keccak256(abi.encodePacked(_actionId, _actionAddress));
        return actionProposals[proposalId];
    }

    /// Helper functions

    /// @notice Generates a pool ID from an address.
    /// @param _addr The address to generate the pool ID from.
    /// @return The pool ID as bytes4.
    function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_addr)));
    }
}
