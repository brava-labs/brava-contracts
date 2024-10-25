// Sources flattened with hardhat v2.22.10 https://hardhat.org

// SPDX-License-Identifier: MIT

// File @openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC20/extensions/IERC20Permit.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].
 *
 * Adds the {permit} method, which can be used to change an account's ERC20 allowance (see {IERC20-allowance}) by
 * presenting a message signed by the account. By not relying on {IERC20-approve}, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 *
 * ==== Security Considerations
 *
 * There are two important considerations concerning the use of `permit`. The first is that a valid permit signature
 * expresses an allowance, and it should not be assumed to convey additional meaning. In particular, it should not be
 * considered as an intention to spend the allowance in any specific way. The second is that because permits have
 * built-in replay protection and can be submitted by anyone, they can be frontrun. A protocol that uses permits should
 * take this into consideration and allow a `permit` call to fail. Combining these two aspects, a pattern that may be
 * generally recommended is:
 *
 * ```solidity
 * function doThingWithPermit(..., uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
 *     try token.permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
 *     doThing(..., value);
 * }
 *
 * function doThing(..., uint256 value) public {
 *     token.safeTransferFrom(msg.sender, address(this), value);
 *     ...
 * }
 * ```
 *
 * Observe that: 1) `msg.sender` is used as the owner, leaving no ambiguity as to the signer intent, and 2) the use of
 * `try/catch` allows the permit to fail and makes the code tolerant to frontrunning. (See also
 * {SafeERC20-safeTransferFrom}).
 *
 * Additionally, note that smart contract wallets (such as Argent or Safe) are not able to produce permit signatures, so
 * contracts should have entry points that don't rely on permit.
 */
interface IERC20Permit {
    /**
     * @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
     * given ``owner``'s signed approval.
     *
     * IMPORTANT: The same issues {IERC20-approve} has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the EIP712-formatted function arguments.
     * - the signature must use ``owner``'s current nonce (see {nonces}).
     *
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     *
     * CAUTION: See Security Considerations above.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for {permit}.
     *
     * Every successful call to {permit} increases ``owner``'s nonce by one. This
     * prevents a signature from being used multiple times.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}


// File @openzeppelin/contracts/token/ERC20/IERC20.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC20/IERC20.sol)

pragma solidity ^0.8.20;

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}


// File @openzeppelin/contracts/utils/Address.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (utils/Address.sol)

pragma solidity ^0.8.20;

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev The ETH balance of the account is not enough to perform the operation.
     */
    error AddressInsufficientBalance(address account);

    /**
     * @dev There's no code at `target` (it is not a contract).
     */
    error AddressEmptyCode(address target);

    /**
     * @dev A call to an address target failed. The target may have reverted.
     */
    error FailedInnerCall();

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.20/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        if (address(this).balance < amount) {
            revert AddressInsufficientBalance(address(this));
        }

        (bool success, ) = recipient.call{value: amount}("");
        if (!success) {
            revert FailedInnerCall();
        }
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason or custom error, it is bubbled
     * up by this function (like regular Solidity function calls). However, if
     * the call reverted with no returned reason, this function reverts with a
     * {FailedInnerCall} error.
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        if (address(this).balance < value) {
            revert AddressInsufficientBalance(address(this));
        }
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and reverts if the target
     * was not a contract or bubbling up the revert reason (falling back to {FailedInnerCall}) in case of an
     * unsuccessful call.
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata
    ) internal view returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            // only check if target is a contract if the call was successful and the return data is empty
            // otherwise we already know that it was a contract
            if (returndata.length == 0 && target.code.length == 0) {
                revert AddressEmptyCode(target);
            }
            return returndata;
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and reverts if it wasn't, either by bubbling the
     * revert reason or with a default {FailedInnerCall} error.
     */
    function verifyCallResult(bool success, bytes memory returndata) internal pure returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            return returndata;
        }
    }

    /**
     * @dev Reverts with returndata if present. Otherwise reverts with {FailedInnerCall}.
     */
    function _revert(bytes memory returndata) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert FailedInnerCall();
        }
    }
}


// File @openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC20/utils/SafeERC20.sol)

pragma solidity ^0.8.20;



/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using Address for address;

    /**
     * @dev An operation with an ERC20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We use {Address-functionCall} to perform this call, which verifies that
        // the target address contains contract code and also asserts for success in the low-level call.

        bytes memory returndata = address(token).functionCall(data);
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silents catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We cannot use {Address-functionCall} here since this should return false
        // and not revert is the subcall reverts.

        (bool success, bytes memory returndata) = address(token).call(data);
        return success && (returndata.length == 0 || abi.decode(returndata, (bool))) && address(token).code.length > 0;
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


// File @openzeppelin/contracts/token/ERC721/IERC721.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC721/IERC721.sol)

pragma solidity ^0.8.20;

/**
 * @dev Required interface of an ERC721 compliant contract.
 */
interface IERC721 is IERC165 {
    /**
     * @dev Emitted when `tokenId` token is transferred from `from` to `to`.
     */
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    /**
     * @dev Emitted when `owner` enables `approved` to manage the `tokenId` token.
     */
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    /**
     * @dev Emitted when `owner` enables or disables (`approved`) `operator` to manage all of its assets.
     */
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /**
     * @dev Returns the number of tokens in ``owner``'s account.
     */
    function balanceOf(address owner) external view returns (uint256 balance);

    /**
     * @dev Returns the owner of the `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function ownerOf(uint256 tokenId) external view returns (address owner);

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon
     *   a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
     * are aware of the ERC721 protocol to prevent tokens from being forever locked.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If the caller is not `from`, it must have been allowed to move this token by either {approve} or
     *   {setApprovalForAll}.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon
     *   a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    /**
     * @dev Transfers `tokenId` token from `from` to `to`.
     *
     * WARNING: Note that the caller is responsible to confirm that the recipient is capable of receiving ERC721
     * or else they may be permanently lost. Usage of {safeTransferFrom} prevents loss, though the caller must
     * understand this adds an external call which potentially creates a reentrancy vulnerability.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must be owned by `from`.
     * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 tokenId) external;

    /**
     * @dev Gives permission to `to` to transfer `tokenId` token to another account.
     * The approval is cleared when the token is transferred.
     *
     * Only a single account can be approved at a time, so approving the zero address clears previous approvals.
     *
     * Requirements:
     *
     * - The caller must own the token or be an approved operator.
     * - `tokenId` must exist.
     *
     * Emits an {Approval} event.
     */
    function approve(address to, uint256 tokenId) external;

    /**
     * @dev Approve or remove `operator` as an operator for the caller.
     * Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller.
     *
     * Requirements:
     *
     * - The `operator` cannot be the address zero.
     *
     * Emits an {ApprovalForAll} event.
     */
    function setApprovalForAll(address operator, bool approved) external;

    /**
     * @dev Returns the account approved for `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function getApproved(uint256 tokenId) external view returns (address operator);

    /**
     * @dev Returns if the `operator` is allowed to manage all of the assets of `owner`.
     *
     * See {setApprovalForAll}
     */
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}


// File @openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol@v5.0.2

// Original license: SPDX_License_Identifier: MIT
// OpenZeppelin Contracts (last updated v5.0.0) (token/ERC721/extensions/IERC721Metadata.sol)

pragma solidity ^0.8.20;

/**
 * @title ERC-721 Non-Fungible Token Standard, optional metadata extension
 * @dev See https://eips.ethereum.org/EIPS/eip-721
 */
interface IERC721Metadata is IERC721 {
    /**
     * @dev Returns the token collection name.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the token collection symbol.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the Uniform Resource Identifier (URI) for `tokenId` token.
     */
    function tokenURI(uint256 tokenId) external view returns (string memory);
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


// File contracts/interfaces/IAdminVault.sol

// Original license: SPDX_License_Identifier: MIT
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
    function initializeFeeTimestamp(address _vault) external;
    function updateFeeTimestamp(address _vault) external;

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


// File contracts/actions/ActionBase.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity =0.8.24;





/// @title ActionBase - Base contract for all actions in the protocol
/// @notice Implements common functionality and interfaces for all actions
/// @dev This contract should be inherited by all specific action contracts
abstract contract ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Interface for the admin vault
    IAdminVault public immutable ADMIN_VAULT;

    /// @notice Interface for the logger
    ILogger public immutable LOGGER;

    /// @notice Basis points for fee calculations (100% = 10000)
    uint256 public constant FEE_BASIS_POINTS = 10000;

    /// @notice Duration of a fee period (1 year)
    uint256 public constant FEE_PERIOD = 365 days;

    /// @notice Enum representing different types of actions
    enum ActionType {
        DEPOSIT_ACTION,
        WITHDRAW_ACTION,
        SWAP_ACTION,
        COVER_ACTION,
        FEE_ACTION,
        TRANSFER_ACTION,
        CUSTOM_ACTION
    }

    /// @notice Initializes the ActionBase contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) {
        ADMIN_VAULT = IAdminVault(_adminVault);
        LOGGER = ILogger(_logger);
    }

    /// @notice Executes the implemented action
    /// @dev This function should be overridden by inheriting contracts
    /// @param _callData Encoded input data for the action
    /// @param _strategyId The ID of the strategy executing this action
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable virtual;

    /// @notice Returns the type of action being implemented
    /// @return uint8 The action type as defined in the ActionType enum
    function actionType() public pure virtual returns (uint8);

    /// @notice Takes the fee due from the vault and performs required updates
    /// @param _vault Address of the vault
    /// @param _feePercentage Fee percentage in basis points
    /// @return uint256 The amount of fee taken
    function _takeFee(address _vault, uint256 _feePercentage) internal returns (uint256) {
        uint256 lastFeeTimestamp = ADMIN_VAULT.getLastFeeTimestamp(_vault);
        uint256 currentTimestamp = block.timestamp;
        if (lastFeeTimestamp == 0) {
            revert Errors.AdminVault_NotInitialized();
        } else if (lastFeeTimestamp == currentTimestamp) {
            return 0; // Don't take fees twice in the same block
        } else {
            IERC20 vault = IERC20(_vault);
            uint256 balance = vault.balanceOf(address(this));
            uint256 fee = _calculateFee(balance, _feePercentage, lastFeeTimestamp, currentTimestamp);
            vault.safeTransfer(ADMIN_VAULT.feeConfig().recipient, fee);
            ADMIN_VAULT.updateFeeTimestamp(_vault);
            return fee;
        }
    }

    /// @notice Calculates the fee due from the vault
    /// @param _totalDeposit Total amount deposited in the vault
    /// @param _feePercentage Fee percentage in basis points
    /// @param _lastFeeTimestamp Timestamp of the last fee collection
    /// @param _currentTimestamp Current timestamp
    /// @return uint256 The calculated fee amount
    function _calculateFee(
        uint256 _totalDeposit,
        uint256 _feePercentage,
        uint256 _lastFeeTimestamp,
        uint256 _currentTimestamp
    ) internal pure returns (uint256) {
        uint256 secondsPassed = _currentTimestamp - _lastFeeTimestamp;
        uint256 annualFee = (_totalDeposit * _feePercentage) / FEE_BASIS_POINTS;
        uint256 feeForPeriod = (annualFee * secondsPassed) / FEE_PERIOD;
        return feeForPeriod;
    }

    /// @notice Generates a pool ID from an address
    /// @param _addr Address to generate the pool ID from
    /// @return bytes4 The generated pool ID
    function _poolIdFromAddress(address _addr) internal pure returns (bytes4) {
        return bytes4(keccak256(abi.encodePacked(_addr)));
    }

    /// @notice Encodes balance update information
    /// @param _strategyId ID of the strategy
    /// @param _poolId ID of the pool
    /// @param _balanceBefore Balance before the action
    /// @param _balanceAfter Balance after the action
    /// @param _feeInTokens Amount of fee taken in tokens
    /// @return bytes Encoded balance update information
    function _encodeBalanceUpdate(
        uint16 _strategyId,
        bytes4 _poolId,
        uint256 _balanceBefore,
        uint256 _balanceAfter,
        uint256 _feeInTokens
    ) internal pure returns (bytes memory) {
        return abi.encode(_strategyId, _poolId, _balanceBefore, _balanceAfter, _feeInTokens);
    }

    /// @notice Returns the name of the protocol
    /// @return string The name of the protocol
    function protocolName() internal pure virtual returns (string memory);
}


// File contracts/interfaces/nexus-mutual/ICoverBroker.sol

// Original license: SPDX_License_Identifier: MIT

pragma solidity =0.8.24;

struct BuyCoverParams {
    uint256 coverId;
    address owner;
    uint24 productId;
    uint8 coverAsset;
    uint96 amount;
    uint32 period;
    uint256 maxPremiumInAsset;
    uint8 paymentAsset;
    uint16 commissionRatio;
    address commissionDestination;
    string ipfsData;
}

struct PoolAllocationRequest {
    uint40 poolId;
    bool skip;
    uint256 coverAmountInAsset;
}

interface ICoverBroker {
    function buyCover(
        BuyCoverParams calldata params,
        PoolAllocationRequest[] calldata poolAllocationRequests
    ) external payable returns (uint256 coverId);
}


// File contracts/libraries/TokenAddressesMainnet.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity =0.8.24;

library TokenAddressesMainnet {
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
}


// File contracts/actions/nexus-mutual/BuyCover.sol

// Original license: SPDX_License_Identifier: MIT
pragma solidity =0.8.24;







/// @title BuyCover - Purchases cover for a specific asset and protocol
/// @notice This contract allows users to buy cover from Nexus Mutual
/// @dev Inherits from ActionBase and implements the buy cover functionality for Nexus Mutual protocol
contract BuyCover is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice Parameters for the buy cover action
    /// @param owner The owner of the cover
    /// @param buyCoverParams The params for the buyCover function
    /// @param poolAllocationRequests The pool allocation requests
    /// @dev poolAllocationRequests are passed in an encoded form, because of their dynamic length
    ///      and the fact that we're just passing them through from the cover router
    struct Params {
        address owner;
        bytes buyCoverParams;
        bytes[] poolAllocationRequests;
    }

    /// @notice Address of the Nexus Mutual Cover Broker contract
    ICoverBroker public constant COVER_BROKER = ICoverBroker(0x0000cbD7a26f72Ff222bf5f136901D224b08BE4E);

    /// @notice Address of the Nexus Mutual Cover NFT contract
    IERC721 public constant COVER_NFT = IERC721(0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb);

    /// @notice Thrown when an invalid asset ID is provided
    error InvalidAssetID();

    /// @notice Initializes the BuyCover contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        // Parse inputs
        Params memory inputData = _parseInputs(_callData);

        // Check inputs
        if (inputData.buyCoverParams.length == 0 || inputData.poolAllocationRequests.length == 0) {
            revert Errors.InvalidInput("BuyCover", "executeAction");
        }

        // Execute action
        (uint32 period, uint256 amount, uint256 coverId) = _buyCover(inputData);

        // Log event
        LOGGER.logActionEvent(2, _encodeBuyCover(_strategyId, period, amount, coverId));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.COVER_ACTION);
    }

    /// @notice Executes the buy cover action
    /// @param _inputData Struct containing buy cover parameters
    function _buyCover(Params memory _inputData) private returns (uint32 period, uint256 amount, uint256 coverId) {
        BuyCoverParams memory params = abi.decode(_inputData.buyCoverParams, (BuyCoverParams));

        PoolAllocationRequest[] memory poolAllocationRequests = new PoolAllocationRequest[](
            _inputData.poolAllocationRequests.length
        );
        for (uint256 i = 0; i < _inputData.poolAllocationRequests.length; i++) {
            poolAllocationRequests[i] = abi.decode(_inputData.poolAllocationRequests[i], (PoolAllocationRequest));
        }

        if (params.paymentAsset == 0) {
            coverId = COVER_BROKER.buyCover{value: params.maxPremiumInAsset}(params, poolAllocationRequests);
        } else {
            IERC20 paymentAsset = IERC20(_assetIdToTokenAddress(params.paymentAsset));
            paymentAsset.safeIncreaseAllowance(address(COVER_BROKER), params.maxPremiumInAsset);
            coverId = COVER_BROKER.buyCover(params, poolAllocationRequests);
        }

        return (params.period, params.amount, coverId);
    }

    /// @notice Converts asset ID to token address
    /// @param _assetId ID of the asset
    /// @return address Token address corresponding to the asset ID
    function _assetIdToTokenAddress(uint256 _assetId) private pure returns (address) {
        if (_assetId == 0) {
            return TokenAddressesMainnet.ETH;
        } else if (_assetId == 1) {
            return TokenAddressesMainnet.DAI;
        } else if (_assetId == 6) {
            return TokenAddressesMainnet.USDC;
        } else {
            revert InvalidAssetID();
        }
    }

    /// @notice Encodes buy cover information for logging
    /// @param _strategyId ID of the strategy
    /// @param _period Cover period
    /// @param _amount Cover amount
    /// @param _coverId ID of the purchased cover
    /// @return bytes Encoded buy cover information
    function _encodeBuyCover(
        uint16 _strategyId,
        uint32 _period,
        uint256 _amount,
        uint256 _coverId
    ) private pure returns (bytes memory) {
        return abi.encode(_strategyId, _period, _amount, _coverId);
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return inputData Decoded Params struct
    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure override returns (string memory) {
        return "Nexus";
    }
}
