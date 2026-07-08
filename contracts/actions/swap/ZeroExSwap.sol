// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.28;

import {IERC20Metadata as IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {ITokenRegistry} from "../../interfaces/ITokenRegistry.sol";

/// @title ZeroExSwap - Swaps tokens using 0x Protocol
/// @notice This contract allows users to swap tokens using the 0x Protocol
/// @dev Inherits from ActionBase and implements the swap functionality for 0x
/// @notice Found a vulnerability? Please contact security@brava.finance - we appreciate responsible disclosure and reward ethical hackers
contract ZeroExSwap is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice The TokenRegistry contract for verifying allowed tokens
    ITokenRegistry public immutable TOKEN_REGISTRY;

    /// @notice Parameters for the ZeroExSwap action
    /// @param tokenIn Address of token to swap from
    /// @param tokenOut Address of token to swap to
    /// @param fromAmount Amount of tokens to swap
    /// @param minToAmount Minimum amount of tokens to receive
    /// @param callValue ETH value to forward to the 0x call
    /// @param swapTarget Address returned by 0x transaction data (transaction.to). Approval is only granted to ALLOWANCE_TARGET.
    /// @param swapCallData Encoded call data from 0x transaction data (transaction.data)
    struct Params {
        address tokenIn;
        address tokenOut;
        uint256 fromAmount;
        uint256 minToAmount;
        uint256 callValue;
        address swapTarget;
        bytes swapCallData;
    }

    /// @notice Initializes the ZeroExSwap contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _tokenRegistry Address of the TokenRegistry contract
    constructor(address _adminVault, address _logger, address _tokenRegistry) ActionBase(_adminVault, _logger) {
        require(_tokenRegistry != address(0), Errors.InvalidInput("ZeroExSwap", "constructor"));
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory params = _parseInputs(_callData);
        // _strategyId is ignored, as this action is not strategy-specific
        _strategyId;

        require(
            TOKEN_REGISTRY.isApprovedToken(params.tokenIn),
            Errors.ZeroEx__TokenNotApproved(params.tokenIn)
        );
        require(
            TOKEN_REGISTRY.isApprovedToken(params.tokenOut),
            Errors.ZeroEx__TokenNotApproved(params.tokenOut)
        );
        
        // Execute the swap
        _zeroExSwap(params);
    }

    /// @notice Executes the 0x swap
    /// @param _params Struct containing swap parameters
    function _zeroExSwap(Params memory _params) internal {
        require(
            _params.fromAmount != 0 && _params.minToAmount != 0,
            Errors.InvalidInput(protocolName(), "executeAction")
        );

        // Basic validation - swap target cannot be zero address
        require(_params.swapTarget != address(0), Errors.ZeroEx__InvalidSwapTarget(_params.swapTarget, address(0)));

        // Check fee timestamps for both tokens
        _checkFeesTaken(_params.tokenIn);
        _checkFeesTaken(_params.tokenOut);

        IERC20 tokenIn = IERC20(_params.tokenIn);
        IERC20 tokenOut = IERC20(_params.tokenOut);

        // Resolve the 0x Allowance Holder (spender) via AdminVault per-action config
        address allowanceTarget = _configAddress();
        // Approve input only to the canonical 0x Allowance Holder (spender)
        // Use strict set-and-reset because 0x routes can be exact-out: the router may not consume
        // the full approved input. Setting to fromAmount and clearing to 0 prevents residual
        // allowances and remains compatible with tokens that require zero-reset (e.g., USDT).
        tokenIn.forceApprove(allowanceTarget, _params.fromAmount);

        uint256 balanceBefore = tokenOut.balanceOf(address(this));

        // Ensure forwarded ETH matches parameters for consistency
        require(msg.value == _params.callValue, Errors.InvalidInput("ZeroExSwap", "callValueMismatch"));
        require(_params.swapCallData.length > 0, Errors.InvalidInput("ZeroExSwap", "swapCallData"));
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = _params.swapTarget.call{value: msg.value}(_params.swapCallData);
        if (!success) {
            revert Errors.ZeroEx__SwapFailed();
        }

        uint256 balanceAfter = tokenOut.balanceOf(address(this));
        uint256 amountReceived = balanceAfter - balanceBefore;

        require(
            amountReceived >= _params.minToAmount,
            Errors.ZeroEx__InsufficientOutput(amountReceived, _params.minToAmount)
        );

        // Clear allowance after the swap to remove any leftover approval from exact-out execution
        tokenIn.forceApprove(allowanceTarget, 0);

        LOGGER.logActionEvent(
            LogType.ZERO_EX_SWAP,
            abi.encode(_params.tokenIn, _params.tokenOut, _params.fromAmount, _params.minToAmount, amountReceived)
        );
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return params Decoded Params struct
    function _parseInputs(bytes memory _callData) internal pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.SWAP_ACTION);
    }

    /// @inheritdoc ActionBase
    function protocolName() public pure override returns (string memory) {
        return "0x";
    }
}