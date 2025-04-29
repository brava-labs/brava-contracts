// SPDX-License-Identifier: MIT
pragma solidity =0.8.28;

import {IERC20Metadata as IERC20} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Errors} from "../../Errors.sol";
import {ActionBase} from "../ActionBase.sol";
import {ITokenRegistry} from "../../interfaces/ITokenRegistry.sol";

/// @title ParaswapSwap - Swaps tokens using Paraswap
/// @notice This contract allows users to swap tokens using the Paraswap protocol
/// @dev Inherits from ActionBase and implements the swap functionality for Paraswap
/// @notice Found a vulnerability? Please contact security@bravalabs.xyz - we appreciate responsible disclosure and reward ethical hackers
contract ParaswapSwap is ActionBase {
    using SafeERC20 for IERC20;

    /// @notice The Paraswap Augustus Router contract
    address public immutable AUGUSTUS_ROUTER;

    /// @notice The TokenRegistry contract for verifying allowed tokens
    ITokenRegistry public immutable TOKEN_REGISTRY;

    /// @notice Function selector for swapExactAmountIn (0xe3ead59e)
    /// @dev Used in Augustus Router's swapExactAmountIn function:
    /// function swapExactAmountIn(address executor, struct swapData, uint256 partnerAndFee, bytes permit, bytes executorData,)
    bytes4 public constant SWAP_EXACT_AMOUNT_IN_SELECTOR = 0xe3ead59e;
    
    /// @notice Function selector for swapExactAmountInOnUniswapV3 (0x876a02f6)
    /// @dev Used in Augustus Router's swapOnUniswap function with nested struct:
    /// function swapExactAmountInOnUniswapV3((address srcToken,address destToken,uint256,uint256,uint256,bytes32,address,bytes), uint256, bytes)
    bytes4 public constant UNISWAP_V3_SWAP_SELECTOR = 0x876a02f6;

    /// @notice Function selector for swapExactAmountInOnCurveV1 (0x1a01c532)
    /// @dev Used in Augustus Router's swapExactAmountInOnCurveV1 function:
    /// function swapExactAmountInOnCurveV1(tuple curveV1Data, uint256 partnerAndFee, bytes permit)
    bytes4 public constant CURVE_V1_SWAP_SELECTOR = 0x1a01c532;

    /// @notice Function selector for swapExactAmountInOnUniswapV2 (0xe8bb3b6c)
    /// @dev Used in Augustus Router's swapExactAmountInOnUniswapV2 function:
    /// function swapExactAmountInOnUniswapV2(tuple uniData, uint256 partnerAndFee, bytes permit)
    bytes4 public constant UNISWAP_V2_SWAP_SELECTOR = 0xe8bb3b6c;

    /// @notice Function selector for swapExactAmountInOutOnMakerPSM (0x987e7d8e)
    /// @dev Used in Augustus Router's swapExactAmountInOutOnMakerPSM function:
    /// function swapExactAmountInOutOnMakerPSM(tuple makerPSMData, bytes permit)
    bytes4 public constant MAKER_PSM_SWAP_SELECTOR = 0x987e7d8e;

    /// @notice Function selector for swapExactAmountInOnCurveV2 (0xe37ed256)
    /// @dev Used in Augustus Router's swapExactAmountInOnCurveV2 function:
    /// function swapExactAmountInOnCurveV2(tuple curveV2Data, uint256 partnerAndFee, bytes permit)
    bytes4 public constant CURVE_V2_SWAP_SELECTOR = 0xe37ed256;

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
    /// @param _tokenRegistry Address of the TokenRegistry contract
    constructor(
        address _adminVault, 
        address _logger, 
        address _augustusRouter,
        address _tokenRegistry
    ) ActionBase(_adminVault, _logger) {
        require(_augustusRouter != address(0) && _tokenRegistry != address(0), 
            Errors.InvalidInput("ParaswapSwap", "constructor"));
        AUGUSTUS_ROUTER = _augustusRouter;
        TOKEN_REGISTRY = ITokenRegistry(_tokenRegistry);
    }

    /// @inheritdoc ActionBase
    function executeAction(bytes memory _callData, uint16 _strategyId) public payable override {
        Params memory params = _parseInputs(_callData);
        // _strategyId is ignored, as this action is not strategy-specific
        _strategyId;

        // Extract the destination token from swapCallData
        address extractedDestToken = extractSwapDestination(params.swapCallData);

        // Verify the destination token is approved in the registry
        require(
            TOKEN_REGISTRY.isApprovedToken(extractedDestToken),
            Errors.Paraswap__TokenNotApproved(extractedDestToken)
        );
        
        // Validate the extracted destination token against our expectations
        require(
            extractedDestToken == params.tokenOut,
            Errors.Paraswap__TokenMismatch(params.tokenOut, extractedDestToken)
        );
        
        // Execute the swap
        _paraswapSwap(params);
    }

    /// @notice Extracts the destination token from swap call data
    /// @param _swapCallData The calldata for the swap
    /// @return The extracted destination token address
    function extractSwapDestination(bytes memory _swapCallData) public pure returns (address) {
        // Make sure we have enough data to extract the selector
        require(_swapCallData.length >= 4, Errors.Paraswap__InvalidCalldata());
        
        // Extract the function selector from the first 4 bytes
        bytes4 selector = bytes4(_swapCallData[0]) | (bytes4(_swapCallData[1]) >> 8) | 
                          (bytes4(_swapCallData[2]) >> 16) | (bytes4(_swapCallData[3]) >> 24);
        
        // Default position for data extraction
        uint256 destTokenPosition;
        
        // Set position based on function selector
        if (selector == SWAP_EXACT_AMOUNT_IN_SELECTOR) {
            // swapExactAmountIn
            destTokenPosition = 68;
        } else if (selector == UNISWAP_V3_SWAP_SELECTOR) {
            // swapExactAmountInOnUniswapV3 
            destTokenPosition = 132;
        } else if (selector == CURVE_V1_SWAP_SELECTOR) {
            // swapExactAmountInOnCurveV1
            destTokenPosition = 100;
        } else if (selector == UNISWAP_V2_SWAP_SELECTOR) {
            // swapExactAmountInOnUniswapV2
            destTokenPosition = 132;
        } else if (selector == MAKER_PSM_SWAP_SELECTOR) {
            // swapExactAmountInOutOnMakerPSM
            destTokenPosition = 36;
        } else if (selector == CURVE_V2_SWAP_SELECTOR) {
            // swapExactAmountInOnCurveV2
            destTokenPosition = 164;
        } else {
            // Unknown selector, revert
            revert Errors.Paraswap__UnsupportedSelector(selector);
        }
        
        // Extract the destination token
        address destToken;
        
        assembly {
            // The actual data in _swapCallData starts at memory position add(_swapCallData, 32)
            let dataPtr := add(_swapCallData, 32)
            
            // Extract the destination token address at the specified position
            destToken := and(mload(add(dataPtr, destTokenPosition)), 0xffffffffffffffffffffffffffffffffffffffff)
        }
        
        return destToken;
    }

    /// @notice Executes the Paraswap swap
    /// @param _params Struct containing swap parameters
    function _paraswapSwap(Params memory _params) internal {
        require(
            _params.fromAmount != 0 && _params.minToAmount != 0,
            Errors.InvalidInput(protocolName(), "executeAction")
        );
        // Check fee timestamps for both tokens
        _checkFeesTaken(_params.tokenIn);
        _checkFeesTaken(_params.tokenOut);

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


