// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import { ActionBase } from "../ActionBase.sol";
import { TokenUtils } from "../../libraries/TokenUtils.sol";
import { IYearnVault } from "../../interfaces/yearn/IYearnVault.sol";

/// @title Burns yTokens and receive underlying tokens in return
/// @dev yTokens need to be approved for user's wallet to pull them (yToken address)
contract YearnWithdraw is ActionBase {
    using TokenUtils for address;

    /// @param yToken - address of yToken to withdraw (same as yVault address)
    /// @param yAmount - amount of yToken to withdraw
    /// @param from - address from which to pull yTokens from
    /// @param to - address where received underlying tokens will be sent to
    struct Params {
        address yToken;
        uint256 yAmount;
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

        inputData.yAmount = _parseParamUint(
            inputData.yAmount,
            _paramMapping[0],
            _returnValues
        );
        inputData.from = _parseParamAddr(inputData.from, _paramMapping[1], _returnValues);
        inputData.to = _parseParamAddr(inputData.to, _paramMapping[2], _returnValues);

        (uint256 amountReceived, bytes memory logData) = _yearnWithdraw(inputData);
        emit ActionEvent("YearnWithdraw", logData);
        return (bytes32(amountReceived));
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes memory _callData) public payable override {
        Params memory inputData = _parseInputs(_callData);
        (, bytes memory logData) = _yearnWithdraw(inputData);
        logger.logActionDirectEvent("YearnWithdraw", logData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.WITHDRAW_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _yearnWithdraw(Params memory _inputData)
       private 
        returns (uint256 tokenAmountReceived, bytes memory logData)
    {
        IYearnVault vault = IYearnVault(_inputData.yToken);

        uint256 amountPulled =
            _inputData.yToken.pullTokensIfNeeded(_inputData.from, _inputData.yAmount);
        _inputData.yAmount = amountPulled;

        address underlyingToken = vault.token();

        uint256 underlyingTokenBalanceBefore = underlyingToken.getBalance(address(this));
        vault.withdraw(_inputData.yAmount, address(this));
        uint256 underlyingTokenBalanceAfter = underlyingToken.getBalance(address(this));
        tokenAmountReceived = underlyingTokenBalanceAfter - underlyingTokenBalanceBefore;

        underlyingToken.withdrawTokens(_inputData.to, tokenAmountReceived);

        logData = abi.encode(_inputData, tokenAmountReceived);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
