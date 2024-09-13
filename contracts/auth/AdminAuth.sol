// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {SafeERC20} from "../libraries/SafeERC20.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {AdminVault} from "./AdminVault.sol";

/// @title AdminAuth Handles owner/admin privileges over smart contracts
abstract contract AdminAuth {
    using SafeERC20 for IERC20;

    error SenderNotOwner();
    error SenderNotAdmin();

    AdminVault public immutable ADMIN_VAULT;

    modifier onlyOwner() {
        if (ADMIN_VAULT.owner() != msg.sender) {
            revert SenderNotOwner();
        }
        _;
    }

    modifier onlyAdmin() {
        if (ADMIN_VAULT.admin() != msg.sender) {
            revert SenderNotAdmin();
        }
        _;
    }

    constructor(address _adminVault) {
        ADMIN_VAULT = AdminVault(_adminVault);
    }

    /// @notice withdraw stuck funds
    function withdrawStuckFunds(address _token, address _receiver, uint256 _amount) public onlyOwner {
        if (_token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            payable(_receiver).transfer(_amount);
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }
}
