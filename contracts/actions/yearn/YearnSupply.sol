// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import { ActionBase } from "../ActionBase.sol";
import { TokenUtils } from "../../libraries/TokenUtils.sol";
import { IYearnVault } from "../../interfaces/yearn/IYearnVault.sol";
import { IYearnRegistry } from "../../interfaces/yearn/IYearnRegistry.sol";

/// @title Supplies tokens to Yearn vault
/// @dev tokens need to be approved for user's wallet to pull them (token address)
contract YearnSupply is ActionBase {
    using TokenUtils for address;

    /// @param token - address of token to supply
    /// @param amount - amount of token to supply
    /// @param from - address from which to pull tokens from
    /// @param to - address where received yTokens will be sent to
    struct Params {
        address token;
        uint256 amount;
        address from;
        address to;
    }

    IYearnRegistry public constant yearnRegistry = IYearnRegistry(address(0x50c1a2eA0a861A967D9d0FFE2AE4012c2E053804));

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

        (uint256 yAmountReceived, bytes memory logData) = _yearnSupply(inputData);
        emit ActionEvent("YearnSupply", logData);
        return bytes32(yAmountReceived);
    }

    /// @inheritdoc ActionBase
    function executeActionDirect(bytes memory _callData) public payable override {
        Params memory inputData = _parseInputs(_callData);
        (, bytes memory logData) = _yearnSupply(inputData);
        logger.logActionDirectEvent("YearnSupply", logData);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.DEPOSIT_ACTION);
    }

    //////////////////////////// ACTION LOGIC ////////////////////////////

    function _yearnSupply(Params memory _inputData) private returns (uint256 yTokenAmount, bytes memory logData) {
        IYearnVault vault = IYearnVault(yearnRegistry.latestVault(_inputData.token));

        uint256 amountPulled =
            _inputData.token.pullTokensIfNeeded(_inputData.from, _inputData.amount);
        _inputData.token.approveToken(address(vault), amountPulled);
        _inputData.amount = amountPulled;

        uint256 yBalanceBefore = address(vault).getBalance(address(this));
        vault.deposit(_inputData.amount, address(this));
        uint256 yBalanceAfter = address(vault).getBalance(address(this));
        yTokenAmount = yBalanceAfter - yBalanceBefore;

        address(vault).withdrawTokens(_inputData.to, yTokenAmount);

        logData = abi.encode(_inputData, yTokenAmount);
    }

    function _parseInputs(bytes memory _callData) private pure returns (Params memory inputData) {
        inputData = abi.decode(_callData, (Params));
    }
}
