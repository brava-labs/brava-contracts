// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {SafeERC20} from "../libraries/SafeERC20.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {AdminVault} from "./AdminVault.sol";
import {AuthConstants} from "./AuthConstants.sol";

/// @title AdminAuth Handles owner/admin privileges over smart contracts
contract AdminAuth is AuthConstants {
    using SafeERC20 for IERC20;

    error SenderNotOwner();
    error SenderNotAdmin();

    AdminVault public constant adminVault = AdminVault(ADMIN_VAULT_ADDR);

    modifier onlyOwner() {
        if (adminVault.owner() != msg.sender) {
            revert SenderNotOwner();
        }
        _;
    }

    modifier onlyAdmin() {
        if (adminVault.admin() != msg.sender) {
            revert SenderNotAdmin();
        }
        _;
    }

    /// @notice withdraw stuck funds
    function withdrawStuckFunds(
        address _token,
        address _receiver,
        uint256 _amount
    ) public onlyOwner {
        if (_token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            payable(_receiver).transfer(_amount);
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }
}
