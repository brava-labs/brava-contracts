// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import { ActionBase } from "../ActionBase.sol";
import { TokenUtils } from "../../libraries/TokenUtils.sol";
import { IFToken } from "../../interfaces/fluid/IFToken.sol";

/// @title Supplies tokens to Yearn vault
/// @dev tokens need to be approved for user's wallet to pull them (token address)
contract FluidSupply is ActionBase {
    using TokenUtils for address;

    /// @param token - address of fToken contract
    /// @param amount - amount of token to supply
    /// @param from - address from which to pull tokens from
    /// @param to - address where received fTokens will be sent to
    struct Params {
        address token;
        uint256 amount;
        address from;
        address to;
    }

    constructor(address _registry, address _logger) ActionBase(_registry, _logger) {}

    /// @inheritdoc ActionBase
    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues
    ) public payable virtual override returns (bytes32) {
        Params memory inputData = _parseInputs(_callData);

        inputData.amount = _parseParamUint(
            inputData.amount,
            _paramMapping[1],
            _returnValues
        );
        inputData.from = _parseParamAddr(inputData.from, _paramMapping[2], _returnValues);
        inputData.to = _parseParamAddr(inputData.to, _paramMapping[3], _returnValues);

        (uint256 fAmountReceived, bytes memory logData) = _fluidSupply(inputData);
        emit ActionEvent("FluidSupply", logData);
        return bytes32(fAmountReceived);
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes memory _callData) public payable override {
        Params memory inputData = _parseInputs(_callData);
        (, bytes memory logData) = _fluidSupply(inputData);
        logger.logActionDirectEvent("FluidSupply", logData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidSupply(Params memory _inputData) private returns (uint256 fTokenAmount, bytes memory logData) {
        IFToken fToken = IFToken(address(_inputData.token));

        uint256 amountPulled =
            _inputData.token.pullTokensIfNeeded(_inputData.from, _inputData.amount);
        _inputData.token.approveToken(address(fToken), amountPulled);
        _inputData.amount = amountPulled;

        uint256 fBalanceBefore = address(fToken).getBalance(address(this));
        fToken.deposit(_inputData.amount, address(this));
        uint256 fBalanceAfter = address(fToken).getBalance(address(this));
        fTokenAmount = fBalanceAfter - fBalanceBefore;

        address(fToken).withdrawTokens(_inputData.to, fTokenAmount);

        logData = abi.encode(_inputData, fTokenAmount);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
