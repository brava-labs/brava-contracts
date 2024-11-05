// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {ICurve3Pool} from "../../interfaces/curve/ICurve3Pool.sol";
import {IERC20Metadata as IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Curve3PoolSwap - Swaps tokens using Curve 3Pool
/// @notice This contract allows users to swap tokens using the Curve 3Pool
/// @dev Inherits from ActionBase and implements the swap functionality for Curve 3Pool
contract Curve3PoolSwap is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice The Curve 3Pool contract
    ICurve3Pool public immutable POOL;

    /// @notice Parameters for the Curve3PoolSwap action
    /// @param fromToken Curve 3Pool token index to swap from
    /// @param toToken Curve 3Pool token index to swap to
    /// @param amountIn Amount of tokens to swap
    /// @param minAmountOut Minimum amount of tokens to receive
    struct Params {
        int128 fromToken;
        int128 toToken;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    /// @notice Initializes the Curve3PoolSwap contract
    /// @param _adminVault Address of the admin vault
    /// @param _logger Address of the logger contract
    /// @param _poolAddress Address of the Curve 3Pool contract
    constructor(address _adminVault, address _logger, address _poolAddress) ActionBase(_adminVault, _logger) {
        POOL = ICurve3Pool(_poolAddress);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory params = _parseInputs(_callData);
        // _strategyId is ignored, as this action is not strategy-specific
        _strategyId;
        _curve3PoolSwap(params);
    }

    /// @inheritdoc ActionBase
    function actionType() public pure override returns (uint8) {
        return uint8(ActionType.SWAP_ACTION);
    }

    /// @notice Executes the Curve 3Pool swap
    /// @param _params Struct containing swap parameters
    function _curve3PoolSwap(Params memory _params) internal {
        if (
            !(_params.fromToken >= 0 && _params.fromToken < 3 && _params.toToken >= 0 && _params.toToken < 3) ||
            _params.fromToken == _params.toToken
        ) {
            revert Errors.Curve3Pool__InvalidTokenIndices(_params.fromToken, _params.toToken);
        }

        if (_params.amountIn == 0 || _params.minAmountOut == 0) {
            revert Errors.InvalidInput("Curve3PoolSwap", "executeAction");
        }

        IERC20 tokenIn = IERC20(POOL.coins(uint256(uint128(_params.fromToken))));
        IERC20 tokenOut = IERC20(POOL.coins(uint256(uint128(_params.toToken))));

        tokenIn.safeIncreaseAllowance(address(POOL), _params.amountIn);

        uint256 balanceBefore = tokenOut.balanceOf(address(this));

        POOL.exchange(_params.fromToken, _params.toToken, _params.amountIn, _params.minAmountOut);

        uint256 balanceAfter = tokenOut.balanceOf(address(this));
        uint256 amountOut = balanceAfter - balanceBefore;

        LOGGER.logActionEvent(LogType.CURVE_3POOL_SWAP, abi.encode(_params, amountOut));
    }

    /// @notice Parses the input data from bytes to Params struct
    /// @param _callData Encoded call data
    /// @return params Decoded Params struct
    function _parseInputs(bytes memory _callData) internal pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }

    /// @inheritdoc ActionBase
    function protocolName() internal pure override returns (string memory) {
        return "Curve";
    }
}
