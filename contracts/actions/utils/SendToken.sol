// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {IOwnerManager} from "../../interfaces/safe/IOwnerManager.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title Helper action to send a token to the specified address
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract SendToken is ActionBase {
    using SafeERC20 for IERC20;

    /// @param tokenAddr Address of token, use 0xEeee... for eth
    /// @param to Where the tokens are sent
    /// @param amount Amount of tokens, can be type(uint).max
    struct Params {
        address tokenAddr;
        address to;
        uint256 amount;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 /*_strategyId*/) public payable override {
        Params memory inputData = _parseInputs(_callData);
        IOwnerManager ownerManager = IOwnerManager(address(this));
        require(ownerManager.isOwner(inputData.to), Errors.Action_InvalidRecipient(protocolName(), actionType()));

        uint256 amountToTransfer = (inputData.amount == type(uint256).max)
            ? _getBalance(inputData.tokenAddr)
            : inputData.amount;

        _sendToken(inputData.tokenAddr, inputData.to, amountToTransfer);

        LOGGER.logActionEvent(LogType.SEND_TOKEN, abi.encode(inputData.tokenAddr, inputData.to, amountToTransfer));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.TRANSFER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Gets the balance of a token or ETH
    /// @param _tokenAddr Address of token, use 0xEeee... for eth
    /// @return balance The balance of the token or ETH
    function _getBalance(address _tokenAddr) internal view returns (uint256) {
        if (_tokenAddr == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            return address(this).balance;
        } else {
            return IERC20(_tokenAddr).balanceOf(address(this));
        }
    }

    /// @notice Sends a token to the specified addr, works with Eth also
    /// @param _tokenAddr Address of token, use 0xEeee... for eth
    /// @param _to Where the tokens are sent
    /// @param _amount Amount of tokens to transfer
    function _sendToken(address _tokenAddr, address _to, uint256 _amount) internal {
        if (_tokenAddr == 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE) {
            // Handle ETH transfer
            (bool success, ) = _to.call{value: _amount}("");
            require(success, "ETH transfer failed");
        } else {
            // Handle ERC20 transfer
            IERC20(_tokenAddr).safeTransfer(_to, _amount);
        }
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }

    function protocolName() public pure override returns (string memory) {
        return "Brava";
    }
}
