// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Enum} from "../libraries/Enum.sol";
import {IEmergencyWithdrawModule} from "../interfaces/IEmergencyWithdrawModule.sol";
import {IOwnerManager} from "../interfaces/safe/IOwnerManager.sol";
import {ISafe} from "../interfaces/safe/ISafe.sol";

/// @title EmergencyWithdrawModule
/// @notice A Safe module providing a guaranteed withdrawal path to owner addresses,
///         independent of AdminVault and SequenceExecutor. If the Brava admin multisig is
///         compromised and the normal bundle execution path is disabled, Safe owners can
///         still withdraw their ERC20 tokens and ETH directly through this module.
/// @dev Fully stateless and immutable — no constructor parameters, no admin, no storage,
///      no dependency on any Brava-controlled contract. The only external dependency is the
///      Safe contract itself (owner checks and module execution).
///      Safe v1.4.1's `execTransactionFromModule` does not invoke the module guard, so this
///      module can target arbitrary `to` addresses even when `BravaGuard` is active.
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract EmergencyWithdrawModule is IEmergencyWithdrawModule, IERC165 {
    error EmergencyWithdraw_CallerNotOwner();
    error EmergencyWithdraw_RecipientNotOwner();
    error EmergencyWithdraw_TransferFailed();
    error EmergencyWithdraw_InvalidAddress();

    /// @inheritdoc IEmergencyWithdrawModule
    function withdrawERC20(address safe, address token, address to, uint256 amount) external {
        _validateOwners(safe, to);

        uint256 transferAmount = amount;
        if (transferAmount == type(uint256).max) {
            transferAmount = IERC20(token).balanceOf(safe);
        }

        bytes memory data = abi.encodeCall(IERC20.transfer, (to, transferAmount));
        (bool success, bytes memory returnData) = ISafe(safe).execTransactionFromModuleReturnData(token, 0, data, Enum.Operation.Call);
        if (!success) {
            revert EmergencyWithdraw_TransferFailed();
        }
        if (returnData.length > 0 && !abi.decode(returnData, (bool))) {
            revert EmergencyWithdraw_TransferFailed();
        }

        emit EmergencyERC20Withdrawal(safe, token, to, transferAmount);
    }

    /// @inheritdoc IEmergencyWithdrawModule
    function withdrawETH(address safe, address to, uint256 amount) external {
        _validateOwners(safe, to);

        uint256 transferAmount = amount;
        if (transferAmount == type(uint256).max) {
            transferAmount = safe.balance;
        }

        bool success = ISafe(safe).execTransactionFromModule(to, transferAmount, "", Enum.Operation.Call);
        if (!success) {
            revert EmergencyWithdraw_TransferFailed();
        }

        emit EmergencyETHWithdrawal(safe, to, transferAmount);
    }

    /// @notice Validates that the caller and recipient are both owners of the Safe
    function _validateOwners(address safe, address to) private view {
        if (safe == address(0) || to == address(0)) {
            revert EmergencyWithdraw_InvalidAddress();
        }
        if (!IOwnerManager(safe).isOwner(msg.sender)) {
            revert EmergencyWithdraw_CallerNotOwner();
        }
        if (!IOwnerManager(safe).isOwner(to)) {
            revert EmergencyWithdraw_RecipientNotOwner();
        }
    }

    /// @inheritdoc IERC165
    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return
            interfaceId == type(IEmergencyWithdrawModule).interfaceId ||
            interfaceId == type(IERC165).interfaceId;
    }
}
