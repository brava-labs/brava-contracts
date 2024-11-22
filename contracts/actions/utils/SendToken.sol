// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {IOwnerManager} from "../../interfaces/safe/IOwnerManager.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title Helper action to send a token to the specified address
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

        _sendToken(inputData.tokenAddr, inputData.to, inputData.amount);

        // Log event
        LOGGER.logActionEvent(LogType.SEND_TOKEN, abi.encode(inputData.tokenAddr, inputData.to, inputData.amount));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.TRANSFER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Sends a token to the specified addr, works with Eth also
    /// @dev If amount is type(uint).max it will send whole user's wallet balance
    /// @param _tokenAddr Address of token, use 0xEeee... for eth
    /// @param _to Where the tokens are sent
    /// @param _amount Amount of tokens, can be type(uint).max
    function _sendToken(address _tokenAddr, address _to, uint256 _amount) internal {
        if (_amount == type(uint256).max) {
            _amount = IERC20(_tokenAddr).balanceOf(address(this));
        }
        IERC20(_tokenAddr).safeTransfer(_to, _amount);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }

    function protocolName() public pure override returns (string memory) {
        return "Brava";
    }
}
