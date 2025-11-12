// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ActionBase} from "../ActionBase.sol";
import {IEip712TypedDataSafeModule} from "../../interfaces/IEip712TypedDataSafeModule.sol";

/// @title GasRefundAction
/// @notice Deposits a capped amount of USDC from the Safe to the EIP-712 module for refund settlement
contract GasRefundAction is ActionBase {
    using SafeERC20 for IERC20;

    IEip712TypedDataSafeModule public immutable EIP712_MODULE;

    struct Params { uint256 maxRefundAmount; }

    constructor(
        address _adminVault,
        address _logger,
        address _eip712Module
    ) ActionBase(_adminVault, _logger) {
        EIP712_MODULE = IEip712TypedDataSafeModule(_eip712Module);
    }

    function executeAction(bytes memory _callData, uint16 /* _strategyId */) public payable override {
        Params memory p = abi.decode(_callData, (Params));

        if (p.maxRefundAmount == 0) return;

        // Delegatecall context means address(this) is the Safe
        // Resolve the refund token for this action from AdminVault configuration
        address refundToken = _configAddress();
        uint256 balance = IERC20(refundToken).balanceOf(address(this));
        if (balance == 0) return;
        uint256 amount = balance < p.maxRefundAmount ? balance : p.maxRefundAmount;
        if (amount == 0) return;
        IERC20(refundToken).safeTransfer(address(EIP712_MODULE), amount);

        LOGGER.logActionEvent(
            LogType.GAS_REFUND,
            abi.encode(refundToken, address(EIP712_MODULE), amount)
        );
    }

    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.FEE_ACTION);
    }

    function protocolName() public pure override returns (string memory) {
        return "Brava";
    }


}


