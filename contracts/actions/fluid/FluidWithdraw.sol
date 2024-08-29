// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import { ActionBase } from "../ActionBase.sol";
import { TokenUtils } from "../../libraries/TokenUtils.sol";
import { IFToken } from "../../interfaces/fluid/IFToken.sol";

/// @title Burns fTokens and receive underlying tokens in return
/// @dev fTokens need to be approved for user's wallet to pull them (fToken address)
contract FluidWithdraw is ActionBase {
    using TokenUtils for address;

    /// @param fToken - address of yToken to withdraw
    /// @param fAmount - amount of yToken to withdraw
    /// @param from - address from which to pull fTokens from
    /// @param to - address where received underlying tokens will be sent to
    struct Params {
        address fToken;
        uint256 fAmount;
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

        inputData.fAmount = _parseParamUint(
            inputData.fAmount,
            _paramMapping[1],
            _returnValues
        );
        inputData.from = _parseParamAddr(inputData.from, _paramMapping[2], _returnValues);
        inputData.to = _parseParamAddr(inputData.to, _paramMapping[3], _returnValues);

        (uint256 amountReceived, bytes memory logData) = _fluidWithdraw(inputData);
        emit ActionEvent("FluidWithdraw", logData);
        return (bytes32(amountReceived));
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes memory _callData) public payable override {
        Params memory inputData = _parseInputs(_callData);
        (, bytes memory logData) = _fluidWithdraw(inputData);
        logger.logActionDirectEvent("FluidWithdraw", logData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _fluidWithdraw(Params memory _inputData)
       private 
        returns (uint256 tokenAmountReceived, bytes memory logData)
    {
        IFToken fToken = IFToken(_inputData.fToken);

        address underlyingToken = fToken.asset();

        uint256 underlyingTokenBalanceBefore = underlyingToken.getBalance(address(this));
        fToken.withdraw(_inputData.fAmount, _inputData.to, address(this));
        uint256 underlyingTokenBalanceAfter = underlyingToken.getBalance(address(this));
        tokenAmountReceived = underlyingTokenBalanceAfter - underlyingTokenBalanceBefore;

        logData = abi.encode(_inputData, tokenAmountReceived);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
