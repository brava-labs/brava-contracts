// SPDX-License-Identifier: MIT
pragma solidity =0.8.24;

import {ActionBase} from "../ActionBase.sol";
import {ICurve3Pool} from "../../interfaces/curve/ICurve3Pool.sol";
import {IERC20} from "../../interfaces/IERC20.sol";
import {TokenUtils} from "../../libraries/TokenUtils.sol";

contract Curve3PoolSwap is ActionBase {
    using TokenUtils for address;

    ICurve3Pool public immutable pool;

    //TODO: we're reading in the index of the token, but should we be reading in the address?
    /// @notice Params for the Curve3PoolSwap action
    /// @param fromToken Curve 3Pool token index
    /// @param toToken Curve 3Pool token index
    /// @param amountIn Amount of tokens to swap
    /// @param minAmountOut Minimum amount of tokens to receive
    /// @param from Address to pull tokens from
    /// @param to Address to send tokens to
    struct Params {
        int128 fromToken;
        int128 toToken;
        uint256 amountIn;
        uint256 minAmountOut;
        address from;
        address to;
    }

    constructor(address _registry, address _logger, address _poolAddress) ActionBase(_registry, _logger) {
        pool = ICurve3Pool(_poolAddress);
    }

    function executeAction(
        bytes memory _callData,
        uint8[] memory _paramMapping,
        bytes32[] memory _returnValues
    ) public payable virtual override returns (bytes32) {
        Params memory params = _parseInputs(_callData);
        params.from = _parseParamAddr(params.from, _paramMapping[4], _returnValues);
        params.to = _parseParamAddr(params.to, _paramMapping[5], _returnValues);

        (uint256 amountOut, bytes memory logData) = _curve3PoolSwap(params);
        emit ActionEvent("Curve3PoolSwap", logData);
        return bytes32(amountOut);
    }

    function executeActionDirect(bytes memory _callData) public payable virtual override {
        Params memory params = _parseInputs(_callData);
        _curve3PoolSwap(params);
    }

    function actionType() public pure virtual override returns (uint8) {
        return uint8(ActionType.SWAP_ACTION);
    }

    function _curve3PoolSwap(Params memory _params) internal returns (uint256 amountOut, bytes memory logData) {
        require(
            _params.fromToken >= 0 && _params.fromToken < 3 && _params.toToken >= 0 && _params.toToken < 3,
            "Invalid token indices"
        );
        require(_params.fromToken != _params.toToken, "Cannot swap same token");

        address tokenIn = pool.coins(uint256(uint128(_params.fromToken)));
        address tokenOut = pool.coins(uint256(uint128(_params.toToken)));

        // check if we need to pull the tokens
        if (IERC20(tokenIn).balanceOf(_params.from) < _params.amountIn) {
            tokenIn.pullTokensIfNeeded(_params.from, _params.amountIn);
        }

        tokenIn.approveToken(address(pool), _params.amountIn);

        uint256 balanceBefore = IERC20(tokenOut).balanceOf(address(this));

        pool.exchange(_params.fromToken, _params.toToken, _params.amountIn, _params.minAmountOut);

        uint256 balanceAfter = IERC20(tokenOut).balanceOf(address(this));
        amountOut = balanceAfter - balanceBefore;
        // TODO: We should add slippage protection here

        // TODO: We currently aren't using _params.to, will we need it for some actions in the future?

        logData = abi.encode(_params, amountOut);
    }

    function _parseInputs(bytes memory _callData) internal pure returns (Params memory params) {
        params = abi.decode(_callData, (Params));
    }
}
