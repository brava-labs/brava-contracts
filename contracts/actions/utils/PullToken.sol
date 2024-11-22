// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title Helper action to pull a token from the specified address
// TODO tests
contract PullToken is ActionBase {
    using SafeERC20 for IERC20;
    /// @param tokenAddr Address of token
    /// @param from From where the tokens are pulled
    /// @param amount Amount of tokens, can be type(uint).max
    struct Params {
        address tokenAddr;
        address from;
        uint256 amount;
    }

    constructor(address _adminVault, address _logger) ActionBase(_adminVault, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 /*_strategyId*/) public payable override {
        Params memory inputData = _parseInputs(_callData);

        _pullToken(inputData.tokenAddr, inputData.from, inputData.amount);

        // Log event
        LOGGER.logActionEvent(LogType.PULL_TOKEN, abi.encode(inputData.tokenAddr, inputData.from, inputData.amount));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.TRANSFER_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    /// @notice Pulls a token from the specified addr, doesn't work with ETH
    /// @dev If amount is type(uint).max it will send whole user's wallet balance
    /// @param _tokenAddr Address of token
    /// @param _from From where the tokens are pulled
    /// @param _amount Amount of tokens, can be type(uint).max
    function _pullToken(address _tokenAddr, address _from, uint256 _amount) internal {
        IERC20(_tokenAddr).safeTransferFrom(_from, address(this), _amount);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }

    function protocolName() internal pure override returns (string memory) {
        return "Brava";
    }
}
