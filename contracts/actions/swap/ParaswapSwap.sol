// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20Metadata as IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";

/// @title ParaswapSwap - Swaps tokens using Paraswap
/// @notice This contract allows users to swap tokens using the Paraswap protocol
/// @dev Inherits from ActionBase and implements the swap functionality for Paraswap
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract ParaswapSwap is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice The Paraswap Augustus Router contract
    address public immutable AUGUSTUS_ROUTER;

    /// @notice Parameters for the ParaswapSwap action
    /// @param tokenIn Address of token to swap from
    /// @param tokenOut Address of token to swap to
    /// @param fromAmount Amount of tokens to swap
    /// @param minToAmount Minimum amount of tokens to receive
    /// @param swapCallData Encoded swap data from Paraswap API
    struct Params {
        address tokenIn;
        address tokenOut;
        uint256 fromAmount;
        uint256 minToAmount;
        bytes swapCallData;
    }

    /// @notice Initializes the ParaswapSwap contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _augustusRouter Address of the Paraswap Augustus Router
    constructor(address _adminVault, address _logger, address _augustusRouter) ActionBase(_adminVault, _logger) {
        AUGUSTUS_ROUTER = _augustusRouter;
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory params = _parseInputs(_callData);
        // _strategyId is ignored, as this action is not strategy-specific
        _strategyId;
        _paraswapSwap(params);
    }

    /// @notice Executes the Paraswap swap
    /// @param _params Struct containing swap parameters
    function _paraswapSwap(Params memory _params) internal {
        require(
            _params.fromAmount != 0 && _params.minToAmount != 0,
            Errors.InvalidInput("ParaswapSwap", "executeAction")
        );

        IERC20 tokenIn = IERC20(_params.tokenIn);
        IERC20 tokenOut = IERC20(_params.tokenOut);

        // Approve spending of input token
        tokenIn.safeIncreaseAllowance(address(AUGUSTUS_ROUTER), _params.fromAmount);

        // Record balance before swap
        uint256 balanceBefore = tokenOut.balanceOf(address(this));

        // Execute swap through Paraswap
        // solhint-disable-next-line avoid-low-level-calls
        (bool success, ) = address(AUGUSTUS_ROUTER).call(_params.swapCallData);

        if (!success) {
            revert Errors.Paraswap__SwapFailed();
        }

        // Calculate received amount
        uint256 balanceAfter = tokenOut.balanceOf(address(this));
        uint256 amountReceived = balanceAfter - balanceBefore;

        // Verify minimum amount received
        require(
            amountReceived >= _params.minToAmount,
            Errors.Paraswap__InsufficientOutput(amountReceived, _params.minToAmount)
        );

        LOGGER.logActionEvent(
            LogType.PARASWAP_SWAP,
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
        return "Paraswap";
    }
}
