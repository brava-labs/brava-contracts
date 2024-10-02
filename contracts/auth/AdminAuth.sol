// SPDX-License-Identifier: MIT

pragma solidity =0.8.24;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title AdminAuth Handles owner/admin privileges over smart contracts
abstract contract AdminAuth {
    using SafeERC20 for IERC20;

    constructor(address _adminVault) {}

    /// @notice withdraw stuck funds
    // TODO: Permissions temporarially disabled, add them when AccessManaged is implemented
    function withdrawStuckFunds(address _token, address _receiver, uint256 _amount) public {
        if (_token == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            payable(_receiver).transfer(_amount);
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }
}
