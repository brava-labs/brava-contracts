// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {ICurve3Pool} from "../../interfaces/curve/ICurve3Pool.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";

contract Curve3PoolSwap is ActionBase {
    using TokenUtils for address;

    ICurve3Pool public immutable POOL;

    error InvalidTokenIndices();
    error CannotSwapSameToken();
    error AmountInMustBeGreaterThanZero();
    error MinimumAmountOutMustBeGreaterThanZero();

    /// @notice Params for the Curve3PoolSwap action
    /// @param fromToken Curve 3Pool token index
    /// @param toToken Curve 3Pool token index
    /// @param amountIn Amount of tokens to swap
    /// @param minAmountOut Minimum amount of tokens to receive
    struct Params {
        int128 fromToken;
        int128 toToken;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    constructor(address _registry, address _logger, address _poolAddress) ActionBase(_registry, _logger) {
        POOL = ICurve3Pool(_poolAddress);
    }

    function executeAction(
        bytes memory _callData,
        uint16 _strategyId
    ) public payable virtual override returns (bytes32) {
        Params memory params = _parseInputs(_callData);

        (uint256 amountOut, bytes memory logData) = _curve3PoolSwap(params, _strategyId);
        LOGGER.logActionEvent("Curve3PoolSwap", logData);
        return bytes32(amountOut);
    }

    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.SWAP_ACTION);
    }

    function _curve3PoolSwap(
        Params memory _params,
        uint16 /*_strategyId*/
    ) internal returns (uint256 amountOut, bytes memory logData) {
        if (!(_params.fromToken >= 0 && _params.fromToken < 3 && _params.toToken >= 0 && _params.toToken < 3)) {
            revert InvalidTokenIndices();
        }

        if (_params.fromToken == _params.toToken) {
            revert CannotSwapSameToken();
        }

        if (_params.amountIn == 0) {
            revert AmountInMustBeGreaterThanZero();
        }

        if (_params.minAmountOut == 0) {
            revert MinimumAmountOutMustBeGreaterThanZero();
        }

        address tokenIn = POOL.coins(uint256(uint128(_params.fromToken)));
        address tokenOut = POOL.coins(uint256(uint128(_params.toToken)));

        tokenIn.approveToken(address(POOL), _params.amountIn);

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        POOL.exchange(_params.fromToken, _params.toToken, _params.amountIn, _params.minAmountOut);

        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;

        logData = abi.encode(_params, amountOut);
    }

    function _parseInputs(bytes memory _callData) internal pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }
}
